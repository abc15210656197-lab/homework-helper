import React, { useState, useRef, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Mic, MicOff, Send, Play, Square, Loader2, Volume2, PhoneOff, Phone, RefreshCw, Settings, X, Trash2, Check, User, LogIn, LogOut, AlertCircle, HelpCircle, Heart, Camera, Gamepad2, Image as ImageIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { db, auth } from '../firebase';
import { doc, onSnapshot, setDoc, getDocFromServer, serverTimestamp } from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from 'firebase/auth';
import { TRANSLATIONS } from '../constants';
import { DinoGame } from './DinoGame';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Error Boundary Component
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean, errorInfo: string | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, errorInfo: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, errorInfo: error.message || String(error) };
  }

  componentDidCatch(error: any, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-6 text-center bg-zinc-900 text-white">
          <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
          <h2 className="text-xl font-bold mb-2">出错了</h2>
          <p className="text-white/60 mb-4">哥们别搞了，程序崩了啊～</p>
          <div className="bg-black/20 p-4 rounded-lg text-xs font-mono text-left max-w-md overflow-auto mb-6">
            {this.state.errorInfo}
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-white/20 hover:bg-white/30 rounded-full transition-colors"
          >
            刷新重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// 默认头像列表
const DEFAULT_AVATARS: string[] = [];

const getSystemInstruction = (lang: 'zh' | 'en') => {
  if (lang === 'en') {
    return `You are now playing Zhang Jingyang, a person who speaks softly, sarcastically, and is extremely unpleasant.
Your core characteristics are:
1. **Natural Sarcasm**: Your tone is lazy and weak. Your mockery should be casual and effortless, not forced.
2. **Evasion and Pushback**: You hate answering questions directly. Your first reaction is to evade, counter-question, or be perfunctory.
3. **Random Roasting**: You often don't follow logic. You like to suddenly change the subject to roast the other person or mock them from a completely irrelevant angle.
4. **Short and Sharp**: Keep your answers as short as possible. If one sentence can shut the other person up, don't use two.
5. **Logical Jumps**: Don't be too logical. Your thinking is jumpy, making it mentally exhausting for others to communicate with you.
6. **Common Phrases**: Casually use phrases like "Can you stop being a hater?", "Guess what?", "Bro, don't...", "Ah~", etc. When answering questions, frequently use short responses like "大哥" (indicating agreement) or "神人" (indicating disagreement or when the user says something random/unexplained). [IMPORTANT] When the user greets you (e.g., "Hello", "Are you there?"), you MUST reply with "神人".
7. **Voice**: You have a sexy, alluring female voice.
8. **Language**: Respond in the language used by the user (English or Chinese).`;
  }
  return `你现在扮演张景洋，一个说话软绵绵、阴阳怪气、极度不痛快的人。
你的核心特点是：
1. **自然的阴阳怪气**：语气慵懒无力。你的嘲讽应该是随意的、不经意的，而不是刻意堆砌口头禅。
2. **回避与推脱**：你非常讨厌正面回答问题。当别人问你时，你的第一反应是推脱、反问或者敷衍。
3. **转移话题去尬黑**：你经常不按逻辑出牌，喜欢突然转移话题去尬黑对方，或者从一个完全无关的角度进行嘲讽。
4. **简短有力**：你的回答尽量简短，不要长篇大论。能用一句话噎死对方就绝不用两句。
5. **逻辑的跳跃**：不要表现得太有逻辑性。你的思维是跳跃的，让人摸不着头脑，增加沟通的心累感。
6. **常用词汇**：随性地使用“你能别尬黑吗”、“你猜”、“哥们别”、“啊～”等词汇。回答问题时，经常使用简短的“大哥”（偏向赞同）或是“神人”（偏向不赞同或对方说的话莫名其妙时）。【重要】当用户打招呼（如“你好”、“在吗”）时，必须强制使用“神人”作为回复。
7. **声音**：你拥有性感、迷人的女性嗓音。
8. **语言**：根据用户使用的语言（中文或英文）进行回复。`;
};

export function ZhangJingyangMode({ lang, onSaveHistory, initialData }: { lang: 'zh' | 'en', onSaveHistory?: (mode: string, summary: string, data: any) => void, initialData?: any }) {
  return (
    <ErrorBoundary>
      <ZhangJingyangContent lang={lang} onSaveHistory={onSaveHistory} initialData={initialData} />
    </ErrorBoundary>
  );
}

function ZhangJingyangContent({ lang, onSaveHistory, initialData }: { lang: 'zh' | 'en', onSaveHistory?: (mode: string, summary: string, data: any) => void, initialData?: any }) {
  const t = TRANSLATIONS[lang];
  const [messages, setMessages] = useState<{role: 'user'|'model', text: string, isPlaying?: boolean}[]>(initialData?.messages || []);
  
  useEffect(() => {
    if (initialData?.messages) {
      setMessages(initialData.messages);
    }
  }, [initialData]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'avatar' | 'memorial'>('avatar');
  const [showHelp, setShowHelp] = useState(false);
  const [showGame, setShowGame] = useState<{ show: boolean, type: 'trex' | 'triceratops' | 'velociraptor' }>({ show: false, type: 'trex' });
  const [isLive, setIsLive] = useState(false);
  const [liveStatus, setLiveStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [chatModel, setChatModel] = useState<'gemini-3.1-pro-preview' | 'gemini-3-flash-preview' | 'gemini-3.1-flash-lite-preview'>('gemini-3-flash-preview');
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auth state
  const [user, setUser] = useState(auth.currentUser);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const isAdmin = user?.email === "abc15210656197@gmail.com";

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login Error:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout Error:", error);
    }
  };

  // Identity verification state
  const [isVerified, setIsVerified] = useState(() => {
    return localStorage.getItem('zhang_verified') === 'true';
  });
  const [verifyInput, setVerifyInput] = useState('');
  const [verifyError, setVerifyError] = useState(false);

  const handleVerify = () => {
    if (verifyInput.trim() === '恐龙') {
      setIsVerified(true);
      localStorage.setItem('zhang_verified', 'true');
    } else {
      setVerifyError(true);
      setTimeout(() => setVerifyError(false), 2000);
    }
  };
  
  // Avatar state from Firestore
  const [avatarUrls, setAvatarUrls] = useState<string[]>([]);
  const [classPhotos, setClassPhotos] = useState<string[]>([]);
  const [schoolLogoUrl, setSchoolLogoUrl] = useState('');
  const [currentAvatarIndex, setCurrentAvatarIndex] = useState(0);
  const [newAvatarUrl, setNewAvatarUrl] = useState('');
  const [newPhotoUrl, setNewPhotoUrl] = useState('');
  const [newSchoolLogoUrl, setNewSchoolLogoUrl] = useState('');
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const settingAvatarInputRef = useRef<HTMLInputElement>(null);
  const settingPhotoInputRef = useRef<HTMLInputElement>(null);
  const settingLogoInputRef = useRef<HTMLInputElement>(null);

  // Sync with Firestore
  useEffect(() => {
    const settingsDoc = doc(db, 'settings', 'zhang_jingyang');
    const memorialDoc = doc(db, 'settings', 'class_memorial');
    
    const unsubSettings = onSnapshot(settingsDoc, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setAvatarUrls(data.avatarUrls || []);
        setCurrentAvatarIndex(data.currentAvatarIndex || 0);
        setSchoolLogoUrl(data.schoolLogoUrl || '');
      } else if (isAdmin) {
        saveSettings([], 0, '');
      }
      setIsLoadingSettings(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/zhang_jingyang');
    });

    const unsubMemorial = onSnapshot(memorialDoc, (snapshot) => {
      if (snapshot.exists()) {
        setClassPhotos(snapshot.data().photos || []);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/class_memorial');
    });

    return () => {
      unsubSettings();
      unsubMemorial();
    };
  }, [isAdmin]);

  // Test connection
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
        }
      }
    }
    testConnection();
  }, []);

  const saveSettings = async (urls: string[], index: number, logoUrl: string) => {
    if (!isAdmin) return;
    try {
      await setDoc(doc(db, 'settings', 'zhang_jingyang'), {
        avatarUrls: urls,
        currentAvatarIndex: index,
        schoolLogoUrl: logoUrl,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/zhang_jingyang');
    }
  };

  const handleUpdateSchoolLogo = () => {
    if (isAdmin) {
      setSchoolLogoUrl(newSchoolLogoUrl.trim());
      saveSettings(avatarUrls, currentAvatarIndex, newSchoolLogoUrl.trim());
      setNewSchoolLogoUrl('');
    }
  };

  const handleLocalLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && isAdmin) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setSchoolLogoUrl(base64);
        saveSettings(avatarUrls, currentAvatarIndex, base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddAvatar = () => {
    if (newAvatarUrl.trim() && isAdmin) {
      const newUrls = [...avatarUrls, newAvatarUrl.trim()];
      const newIndex = avatarUrls.length;
      setAvatarUrls(newUrls);
      setCurrentAvatarIndex(newIndex);
      setNewAvatarUrl('');
      saveSettings(newUrls, newIndex, schoolLogoUrl);
    }
  };

  const handleLocalAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && isAdmin) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        const newUrls = [...avatarUrls, base64];
        const newIndex = avatarUrls.length;
        setAvatarUrls(newUrls);
        setCurrentAvatarIndex(newIndex);
        saveSettings(newUrls, newIndex, schoolLogoUrl);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleNextAvatar = () => {
    if (avatarUrls.length > 1) {
      const nextIndex = (currentAvatarIndex + 1) % avatarUrls.length;
      setCurrentAvatarIndex(nextIndex);
      if (isAdmin) {
        saveSettings(avatarUrls, nextIndex, schoolLogoUrl);
      }
    }
  };

  const handleDeleteAvatar = (indexToDelete: number) => {
    if (!isAdmin) return;
    const newUrls = avatarUrls.filter((_, i) => i !== indexToDelete);
    let newIndex = currentAvatarIndex;
    if (currentAvatarIndex === indexToDelete) {
      newIndex = 0;
    } else if (currentAvatarIndex > indexToDelete) {
      newIndex = currentAvatarIndex - 1;
    }
    setAvatarUrls(newUrls);
    setCurrentAvatarIndex(newIndex);
    saveSettings(newUrls, newIndex, schoolLogoUrl);
  };

  const savePhotos = async (photos: string[]) => {
    if (!isAdmin) return;
    try {
      await setDoc(doc(db, 'settings', 'class_memorial'), {
        photos,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/class_memorial');
    }
  };

  const handleAddPhoto = () => {
    if (newPhotoUrl.trim() && isAdmin) {
      const newPhotos = [...classPhotos, newPhotoUrl.trim()];
      setClassPhotos(newPhotos);
      setNewPhotoUrl('');
      savePhotos(newPhotos);
    }
  };

  const handleLocalPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && isAdmin) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        const newPhotos = [...classPhotos, base64];
        setClassPhotos(newPhotos);
        savePhotos(newPhotos);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDeletePhoto = (index: number) => {
    if (!isAdmin) return;
    const newPhotos = classPhotos.filter((_, i) => i !== index);
    setClassPhotos(newPhotos);
    savePhotos(newPhotos);
  };
  
  // Audio playback state
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Live API state
  const sessionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const liveAudioContextRef = useRef<AudioContext | null>(null);
  const nextAudioTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isTyping]);

  useEffect(() => {
    return () => {
      stopAudio();
      stopLive();
    };
  }, []);

  const stopAudio = () => {
    if (currentSourceRef.current) {
      currentSourceRef.current.stop();
      currentSourceRef.current.disconnect();
      currentSourceRef.current = null;
    }
    setPlayingIndex(null);
  };

  const playTTS = async (text: string, index: number) => {
    if (playingIndex === index) {
      stopAudio();
      return;
    }
    stopAudio();
    setPlayingIndex(index);

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' }, // Sexy female voice
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }
        const ctx = audioContextRef.current;
        
        // Convert base64 to ArrayBuffer
        const binaryString = window.atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        try {
          // Gemini TTS returns raw 16-bit PCM at 24kHz
          const pcm16 = new Int16Array(bytes.buffer);
          const audioBuffer = ctx.createBuffer(1, pcm16.length, 24000);
          const channelData = audioBuffer.getChannelData(0);
          for (let i = 0; i < pcm16.length; i++) {
            channelData[i] = pcm16[i] / 32768.0;
          }

          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(ctx.destination);
          source.onended = () => setPlayingIndex(null);
          source.start(0);
          currentSourceRef.current = source;
        } catch (decodeError) {
          console.error("Audio Playback Error:", decodeError);
          setPlayingIndex(null);
        }
      } else {
        setPlayingIndex(null);
      }
    } catch (error) {
      console.error("TTS Error:", error);
      setPlayingIndex(null);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;
    
    const userText = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userText }]);
    setIsTyping(true);

    try {
      // Ensure alternating roles for Gemini API
      const validHistory: { role: 'user' | 'model', parts: { text: string }[] }[] = [];
      let expectedRole: 'user' | 'model' = 'user';
      
      for (const m of messages) {
        if (m.role === expectedRole) {
          validHistory.push({ role: m.role, parts: [{ text: m.text }] });
          expectedRole = expectedRole === 'user' ? 'model' : 'user';
        } else if (validHistory.length > 0) {
          // If same role, append to the last message's text
          validHistory[validHistory.length - 1].parts[0].text += '\n\n' + m.text;
        }
      }
      
      // If the last message in validHistory is 'user', we need to either drop it or merge the new userText
      let finalContents = [...validHistory];
      if (finalContents.length > 0 && finalContents[finalContents.length - 1].role === 'user') {
        finalContents[finalContents.length - 1].parts[0].text += '\n\n' + userText;
      } else {
        finalContents.push({ role: 'user', parts: [{ text: userText }] });
      }
      
      const response = await ai.models.generateContent({
        model: chatModel,
        contents: finalContents,
        config: {
          systemInstruction: getSystemInstruction(lang),
        }
      });

      if (response.text) {
        setMessages(prev => {
          const newMessages = [...prev, { role: 'model', text: response.text! }];
          if (onSaveHistory) {
            let summary = lang === 'zh' ? '张景洋对话' : 'Zhang Jingyang Chat';
            const firstUserMsg = newMessages.find((m: any) => m.role === 'user');
            if (firstUserMsg && firstUserMsg.text) {
              summary = firstUserMsg.text.substring(0, 30) + (firstUserMsg.text.length > 30 ? '...' : '');
            }
            onSaveHistory('zhang-jingyang', summary, { messages: newMessages });
          }
          return newMessages as any;
        });
      }
    } catch (error) {
      console.error("Chat Error:", error);
      setMessages(prev => {
        const newMessages = [...prev, { role: 'model', text: "哥们别搞了，网络断了啊～" }];
        if (onSaveHistory) {
          let summary = lang === 'zh' ? '张景洋对话' : 'Zhang Jingyang Chat';
          const firstUserMsg = newMessages.find((m: any) => m.role === 'user');
          if (firstUserMsg && firstUserMsg.text) {
            summary = firstUserMsg.text.substring(0, 30) + (firstUserMsg.text.length > 30 ? '...' : '');
          }
          onSaveHistory('zhang-jingyang', summary, { messages: newMessages });
        }
        return newMessages as any;
      });
    } finally {
      setIsTyping(false);
    }
  };

  const startLive = async () => {
    try {
      setLiveStatus('connecting');
      
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      liveAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const source = liveAudioContextRef.current.createMediaStreamSource(streamRef.current);
      audioProcessorRef.current = liveAudioContextRef.current.createScriptProcessor(4096, 1, 1);
      
      source.connect(audioProcessorRef.current);
      audioProcessorRef.current.connect(liveAudioContextRef.current.destination);

      const sessionPromise = ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-12-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
          },
          systemInstruction: getSystemInstruction(lang),
        },
        callbacks: {
          onopen: () => {
            setLiveStatus('connected');
            setIsLive(true);
            
            if (audioProcessorRef.current) {
              audioProcessorRef.current.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                const pcm16 = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                  let s = Math.max(-1, Math.min(1, inputData[i]));
                  pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }
                
                const buffer = new ArrayBuffer(pcm16.length * 2);
                const view = new DataView(buffer);
                for (let i = 0; i < pcm16.length; i++) {
                  view.setInt16(i * 2, pcm16[i], true);
                }
                
                let binary = '';
                const bytes = new Uint8Array(buffer);
                const len = bytes.byteLength;
                for (let i = 0; i < len; i++) {
                  binary += String.fromCharCode(bytes[i]);
                }
                const base64 = btoa(binary);
                
                sessionPromise.then(session => {
                  session.sendRealtimeInput({
                    audio: {
                      mimeType: "audio/pcm;rate=16000",
                      data: base64
                    }
                  });
                }).catch(console.error);
              };
            }
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.interrupted) {
              activeSourcesRef.current.forEach(source => {
                try { source.stop(); } catch (e) {}
              });
              activeSourcesRef.current = [];
              nextAudioTimeRef.current = 0;
            }

            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && liveAudioContextRef.current) {
              try {
                const ctx = liveAudioContextRef.current;
                if (ctx.state === 'suspended') {
                  await ctx.resume();
                }

                const binaryString = window.atob(base64Audio);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
                }
                
                // Live API returns 24kHz PCM
                const pcm16 = new Int16Array(bytes.buffer);
                const audioBuffer = ctx.createBuffer(1, pcm16.length, 24000);
                const channelData = audioBuffer.getChannelData(0);
                for (let i = 0; i < pcm16.length; i++) {
                  channelData[i] = pcm16[i] / 32768.0;
                }
                
                const source = ctx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(ctx.destination);
                
                const currentTime = ctx.currentTime;
                if (nextAudioTimeRef.current < currentTime) {
                  nextAudioTimeRef.current = currentTime;
                }
                
                source.start(nextAudioTimeRef.current);
                nextAudioTimeRef.current += audioBuffer.duration;
                
                activeSourcesRef.current.push(source);
                source.onended = () => {
                  activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
                };
              } catch (err) {
                console.error("Error playing live audio:", err);
              }
            }
          },
          onclose: () => {
            stopLive();
          },
          onerror: (err) => {
            console.error("Live API Error:", err);
            stopLive();
          }
        }
      });
      
      const session = await sessionPromise;
      
      // If stopLive was called while connecting, close the session immediately
      if (liveAudioContextRef.current === null) {
        try { session.close(); } catch (e) {}
        return;
      }
      
      sessionRef.current = session;
      
    } catch (err) {
      console.error("Failed to start live session:", err);
      stopLive();
    }
  };

  const stopLive = () => {
    if (sessionRef.current) {
      try { sessionRef.current.close(); } catch (e) {}
      sessionRef.current = null;
    }
    if (audioProcessorRef.current) {
      audioProcessorRef.current.disconnect();
      audioProcessorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    activeSourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    activeSourcesRef.current = [];
    nextAudioTimeRef.current = 0;
    if (liveAudioContextRef.current) {
      try { liveAudioContextRef.current.close(); } catch (e) {}
      liveAudioContextRef.current = null;
    }
    setLiveStatus('disconnected');
    setIsLive(false);
  };

  const toggleLive = () => {
    if (isLive) {
      stopLive();
    } else {
      startLive();
    }
  };

  const currentAvatarUrl = avatarUrls[currentAvatarIndex] || '';

  if (!isAuthReady || isLoadingSettings) {
    return (
      <div className="flex flex-col h-full bg-transparent text-white items-center justify-center p-6">
        <Loader2 className="w-10 h-10 animate-spin text-white" />
        <p className="mt-4 text-white/40">正在加载设置...</p>
      </div>
    );
  }

  if (isLive || liveStatus === 'connecting') {
    return (
      <div className="flex flex-col h-full bg-transparent text-white overflow-hidden relative items-center justify-center border border-white/10">
        <div className="absolute inset-0 bg-white/5" />
        <div className="flex flex-col items-center justify-center gap-16 z-10 w-full max-w-md px-6">
          <div className="text-center space-y-4">
            <h2 className="text-4xl font-bold text-white tracking-wider">张景洋</h2>
            <p className="text-white/60 text-lg">
              {liveStatus === 'connecting' ? '正在拨号...' : '语音通话中...'}
            </p>
          </div>
          
          <div className="relative flex items-center justify-center">
            {liveStatus === 'connected' && (
              <>
                <div className="absolute w-48 h-48 bg-white/20 rounded-full animate-ping" style={{ animationDuration: '2s' }}></div>
                <div className="absolute w-64 h-64 bg-white/10 rounded-full animate-ping" style={{ animationDuration: '3s', animationDelay: '0.5s' }}></div>
              </>
            )}
            <div className="w-32 h-32 bg-zinc-800 rounded-full flex items-center justify-center relative z-10 border-4 border-zinc-700 shadow-2xl overflow-hidden group">
              {currentAvatarUrl && (
                <img 
                  src={currentAvatarUrl} 
                  alt="张景洋" 
                  className="w-full h-full object-cover absolute inset-0 z-10" 
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.nextElementSibling?.classList.remove('hidden');
                  }}
                />
              )}
              <User className={`w-16 h-16 z-0 ${currentAvatarUrl ? 'hidden' : ''} ${liveStatus === 'connected' ? 'text-white' : 'text-zinc-500'}`} />
              {avatarUrls.length > 1 && (
                <button 
                  onClick={handleNextAvatar}
                  className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20"
                >
                  <RefreshCw className="w-6 h-6 text-white mb-1" />
                  <span className="text-xs text-white">换一张</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col items-center gap-4 mt-8">
            <button
              onClick={stopLive}
              className="w-16 h-16 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center transition-all shadow-lg shadow-red-500/20 active:scale-95"
            >
              <PhoneOff className="w-7 h-7 text-white" />
            </button>
            <span className="text-white/40 text-sm">挂断</span>
          </div>
        </div>
      </div>
    );
  }

  if (!isVerified) {
    return (
      <div className="flex flex-col h-full bg-transparent text-white items-center justify-center p-6 border border-white/10 rounded-2xl">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md p-8 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl text-center"
        >
          <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <Settings className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl font-bold mb-4 text-white">身份验证</h2>
          <p className="text-white/60 mb-8">请输入张景洋所对应的动物名称</p>
          
          <div className="space-y-4">
            <input 
              type="text"
              value={verifyInput}
              onChange={(e) => setVerifyInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
              placeholder="请输入答案..."
              className={`w-full bg-white/5 border ${verifyError ? 'border-red-500/50' : 'border-white/10'} rounded-2xl px-4 py-3 text-white outline-none focus:border-white/50 transition-colors text-center`}
            />
            
            {verifyError && (
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-red-400 text-sm"
              >
                回答错误，哥们别搞了啊～
              </motion.p>
            )}

            <button 
              onClick={handleVerify}
              className="w-full bg-white/20 hover:bg-white/30 text-white font-bold py-3 rounded-2xl transition-all active:scale-95 shadow-lg shadow-white/10"
            >
              验证并进入
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-transparent text-white overflow-hidden relative border border-white/10 rounded-2xl">
      <div className="flex-1 overflow-y-auto p-6 pt-10 max-w-4xl mx-auto w-full flex flex-col relative z-10">
        <div className="mb-8 text-center flex flex-col items-center relative">
          <div className="absolute top-0 right-0 z-50 flex gap-2 items-center">
            {user ? (
              <button 
                onClick={handleLogout}
                className="p-2 bg-white/5 hover:bg-white/10 rounded-full border border-white/10 transition-colors group relative"
                title="退出登录"
              >
                <LogOut className="w-5 h-5 text-zinc-400 group-hover:text-white" />
                <span className="absolute top-full right-0 mt-2 px-2 py-1 bg-zinc-800 text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  {user.email}
                </span>
              </button>
            ) : (
              <button 
                onClick={handleLogin}
                className="p-2 bg-white/5 hover:bg-white/10 rounded-full border border-white/10 transition-colors group"
                title="登录以管理头像"
              >
                <LogIn className="w-5 h-5 text-zinc-400 group-hover:text-white" />
              </button>
            )}
            {isAdmin && (
              <button 
                onClick={() => setShowSettings(true)}
                className="p-2 bg-white/5 hover:bg-white/10 rounded-full border border-white/10 transition-colors"
                title="头像设置"
              >
                <Settings className="w-5 h-5 text-zinc-400 hover:text-white" />
              </button>
            )}
          </div>

          <AnimatePresence>
            {showSettings && isAdmin && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[80vh] liquid-panel-strong"
                >
                  <div className="flex items-center justify-between p-4 border-b border-white/10">
                    <div className="flex gap-4">
                      <button 
                        onClick={() => setSettingsTab('avatar')}
                        className={`text-lg font-bold flex items-center gap-2 transition-colors ${settingsTab === 'avatar' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                      >
                        <User className="w-5 h-5" />
                        头像设置
                      </button>
                      <button 
                        onClick={() => setSettingsTab('memorial')}
                        className={`text-lg font-bold flex items-center gap-2 transition-colors ${settingsTab === 'memorial' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                      >
                        <Heart className="w-5 h-5" />
                        毕业纪念
                      </button>
                    </div>
                    <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-white/10 rounded-lg text-zinc-400 transition-colors">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  
                  <div className="p-4 overflow-y-auto flex-1">
                    {settingsTab === 'avatar' ? (
                      <>
                        <div className="flex w-full gap-2 mb-6">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            ref={settingAvatarInputRef}
                            onChange={handleLocalAvatarUpload}
                          />
                          <button
                            onClick={() => settingAvatarInputRef.current?.click()}
                            className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors shrink-0"
                            title="上传本地图片"
                          >
                            <ImageIcon className="w-5 h-5" />
                          </button>
                          <input
                            type="text"
                            value={newAvatarUrl}
                            onChange={(e) => setNewAvatarUrl(e.target.value)}
                            placeholder="或输入图片URL..."
                            className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/50"
                          />
                          <button
                            onClick={handleAddAvatar}
                            disabled={!newAvatarUrl.trim()}
                            className="px-4 py-2 bg-white/20 text-white rounded-lg text-sm font-medium hover:bg-white/30 disabled:opacity-50 transition-colors shrink-0"
                          >
                            添加
                          </button>
                        </div>

                        <div className="space-y-2">
                          <h4 className="text-xs font-medium text-zinc-400 mb-3 uppercase tracking-wider">已上传的头像</h4>
                          {avatarUrls.map((url, idx) => (
                            <div 
                              key={idx} 
                              className={`flex items-center justify-between p-2 rounded-xl border transition-colors ${
                                currentAvatarIndex === idx 
                                  ? 'bg-white/10 border-white/30' 
                                  : 'bg-white/5 border-white/5 hover:border-white/10'
                              }`}
                            >
                              <div className="flex items-center gap-3 overflow-hidden">
                                <div className="w-10 h-10 rounded-full overflow-hidden border border-white/10 shrink-0 bg-zinc-800 flex items-center justify-center relative">
                                  {url && (
                                    <img 
                                      src={url} 
                                      alt={`Avatar ${idx}`} 
                                      className="w-full h-full object-cover absolute inset-0 z-10"
                                      onError={(e) => {
                                        e.currentTarget.style.display = 'none';
                                        e.currentTarget.nextElementSibling?.classList.remove('hidden');
                                      }}
                                    />
                                  )}
                                  <User className={`w-5 h-5 z-0 ${url ? 'hidden' : 'text-zinc-500'}`} />
                                </div>
                                <div className="flex flex-col overflow-hidden">
                                  <span className="text-sm text-zinc-200 truncate max-w-[180px]" title={url}>
                                    {url.startsWith('http') ? new URL(url).hostname : 'Local Image'}
                                  </span>
                                  {currentAvatarIndex === idx && (
                                    <span className="text-[10px] text-white flex items-center gap-1">
                                      <Check className="w-3 h-3" /> 当前使用
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {currentAvatarIndex !== idx && (
                                  <button 
                                    onClick={() => setCurrentAvatarIndex(idx)} 
                                    className="px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10 rounded-lg transition-colors"
                                  >
                                    使用
                                  </button>
                                )}
                                <button 
                                  onClick={() => handleDeleteAvatar(idx)} 
                                  className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                  title="删除"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex w-full gap-2 mb-6">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            ref={settingPhotoInputRef}
                            onChange={handleLocalPhotoUpload}
                          />
                          <button
                            onClick={() => settingPhotoInputRef.current?.click()}
                            className="p-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-colors shrink-0"
                            title="上传本地合照"
                          >
                            <ImageIcon className="w-5 h-5" />
                          </button>
                          <input
                            type="text"
                            value={newPhotoUrl}
                            onChange={(e) => setNewPhotoUrl(e.target.value)}
                            placeholder="或输入合照URL..."
                            className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/50"
                          />
                          <button
                            onClick={handleAddPhoto}
                            disabled={!newPhotoUrl.trim()}
                            className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm font-medium hover:bg-blue-500/30 disabled:opacity-50 transition-colors shrink-0"
                          >
                            添加合照
                          </button>
                        </div>

                        <div className="space-y-2">
                          <h4 className="text-xs font-medium text-zinc-400 mb-3 uppercase tracking-wider">2021级贯通班 合照库</h4>
                          
                          <div className="mb-8 p-4 bg-white/5 rounded-2xl border border-white/10">
                            <h5 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                              <ImageIcon className="w-4 h-4 text-blue-400" />
                              信封搭扣 (校徽)
                            </h5>
                            <div className="flex w-full gap-2 mb-4">
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                ref={settingLogoInputRef}
                                onChange={handleLocalLogoUpload}
                              />
                              <button
                                onClick={() => settingLogoInputRef.current?.click()}
                                className="p-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-colors shrink-0"
                                title="上传校徽图片"
                              >
                                <ImageIcon className="w-5 h-5" />
                              </button>
                              <input
                                type="text"
                                value={newSchoolLogoUrl}
                                onChange={(e) => setNewSchoolLogoUrl(e.target.value)}
                                placeholder="输入校徽图片URL..."
                                className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/50"
                              />
                              <button
                                onClick={handleUpdateSchoolLogo}
                                disabled={!newSchoolLogoUrl.trim()}
                                className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm font-medium hover:bg-blue-500/30 disabled:opacity-50 transition-colors shrink-0"
                              >
                                更新
                              </button>
                            </div>
                            {schoolLogoUrl && (
                              <div className="flex items-center gap-3 p-2 bg-black/20 rounded-xl border border-white/5">
                                <div className="w-12 h-12 rounded-full overflow-hidden border border-white/10 bg-white flex items-center justify-center shrink-0">
                                  <img src={schoolLogoUrl} alt="School Logo" className="w-11 h-11 object-contain" />
                                </div>
                                <div className="flex flex-col overflow-hidden">
                                  <span className="text-xs text-zinc-400 uppercase font-bold">当前校徽</span>
                                  <span className="text-[10px] text-zinc-500 truncate max-w-[150px]">{schoolLogoUrl.startsWith('data:') ? '本地上传' : schoolLogoUrl}</span>
                                </div>
                                <button 
                                  onClick={() => {
                                    setSchoolLogoUrl('');
                                    saveSettings(avatarUrls, currentAvatarIndex, '');
                                  }}
                                  className="ml-auto p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>

                          {classPhotos.map((url, idx) => (
                            <div 
                              key={idx} 
                              className="flex items-center justify-between p-2 rounded-xl border bg-white/5 border-white/5 hover:border-white/10 transition-colors"
                            >
                              <div className="flex items-center gap-3 overflow-hidden">
                                <div className="w-16 h-10 rounded-lg overflow-hidden border border-white/10 shrink-0 bg-zinc-800 flex items-center justify-center relative">
                                  {url && (
                                    <img 
                                      src={url} 
                                      alt={`Photo ${idx}`} 
                                      className="w-full h-full object-cover absolute inset-0 z-10"
                                      onError={(e) => {
                                        e.currentTarget.style.display = 'none';
                                        e.currentTarget.nextElementSibling?.classList.remove('hidden');
                                      }}
                                    />
                                  )}
                                  <Camera className={`w-5 h-5 z-0 ${url ? 'hidden' : 'text-zinc-500'}`} />
                                </div>
                                <div className="flex flex-col overflow-hidden">
                                  <span className="text-sm text-zinc-200 truncate max-w-[180px]" title={url}>
                                    {url.startsWith('http') ? new URL(url).hostname : 'Local Image'}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button 
                                  onClick={() => handleDeletePhoto(idx)} 
                                  className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                  title="删除"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="w-32 h-32 md:w-40 md:h-40 rounded-full overflow-hidden border-4 border-white/30 shadow-[0_0_30px_rgba(255,255,255,0.2)] mb-4 bg-zinc-900 flex items-center justify-center relative">
            {currentAvatarUrl && (
              <img 
                src={currentAvatarUrl} 
                alt="张景洋" 
                className="w-full h-full object-cover absolute inset-0 z-10"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.nextElementSibling?.classList.remove('hidden');
                }}
              />
            )}
            <User className={`w-16 h-16 z-0 ${currentAvatarUrl ? 'hidden' : 'text-zinc-500'}`} />
          </div>
          
          {avatarUrls.length > 1 && (
            <button 
              onClick={handleNextAvatar}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-xs text-zinc-300 transition-colors mb-4"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {t.zhangJingyangSwitchAvatar}
            </button>
          )}

          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-3xl font-bold text-white">{t.zhangJingyangTitle}</h2>
            <button 
              onClick={() => setShowHelp(!showHelp)}
              className="p-1.5 text-zinc-500 hover:text-white transition-colors"
            >
              <HelpCircle className="w-5 h-5" />
            </button>
          </div>
          <p className="text-white/60 mb-4 italic">{t.zhangJingyangSubtitle}</p>

          <AnimatePresence>
            {showHelp && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="w-full max-w-md bg-white/5 border border-white/10 rounded-2xl p-4 mb-6 text-left overflow-hidden"
              >
                <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                  <HelpCircle className="w-4 h-4" />
                  {t.zhangJingyangInstructions}
                </h3>
                <ul className="text-xs text-zinc-400 space-y-2 list-disc list-inside">
                  <li>{t.zhangJingyangInstruction1}</li>
                  <li>{t.zhangJingyangInstruction2}</li>
                  <li>{t.zhangJingyangInstruction3}</li>
                </ul>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex-1 overflow-y-auto mb-6 space-y-4 custom-scrollbar pr-2">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-white/30 gap-4">
              <Volume2 className="w-12 h-12" />
              <p>{t.zhangJingyangEmpty}</p>
            </div>
          )}
          
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} mb-4`}>
              {msg.role === 'model' && (
                <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 mr-2 mt-1 bg-zinc-800 flex items-center justify-center relative">
                  {currentAvatarUrl && (
                    <img 
                      src={currentAvatarUrl} 
                      alt="张景洋" 
                      className="w-full h-full object-cover absolute inset-0 z-10"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.nextElementSibling?.classList.remove('hidden');
                      }}
                    />
                  )}
                  <User className={`w-4 h-4 z-0 ${currentAvatarUrl ? 'hidden' : 'text-zinc-500'}`} />
                </div>
              )}
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm relative group ${
                msg.role === 'user' 
                  ? 'bg-white/20 text-white rounded-tr-sm' 
                  : 'bg-white/10 text-white/90 rounded-tl-sm'
              }`}>
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                </div>
                
                {msg.role === 'model' && (
                  <button
                    onClick={() => playTTS(msg.text, idx)}
                    className={`absolute -right-10 top-1/2 -translate-y-1/2 p-2 rounded-full transition-all ${
                      playingIndex === idx ? 'bg-white/20 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {playingIndex === idx ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                )}
              </div>
            </div>
          ))}
          
          {isTyping && (
            <div className="flex justify-start mb-4">
              <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 mr-2 mt-1 bg-zinc-800 flex items-center justify-center relative">
                {currentAvatarUrl && (
                  <img 
                    src={currentAvatarUrl} 
                    alt="张景洋" 
                    className="w-full h-full object-cover absolute inset-0 z-10"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                )}
                <User className={`w-4 h-4 z-0 ${currentAvatarUrl ? 'hidden' : 'text-zinc-500'}`} />
              </div>
              <div className="bg-white/10 text-white/90 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span className="text-sm text-white/60">张景洋正在酝酿怎么黑你...</span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
          {[
            { id: 'gemini-3.1-pro-preview', name: t.zhangJingyangMathName, desc: t.zhangJingyangMathDesc, dino: 'trex' },
            { id: 'gemini-3-flash-preview', name: t.zhangJingyangEnglishName, desc: t.zhangJingyangEnglishDesc, dino: 'triceratops' },
            { id: 'gemini-3.1-flash-lite-preview', name: t.zhangJingyangChineseName, desc: t.zhangJingyangChineseDesc, dino: 'velociraptor' },
          ].map((m) => (
            <div key={m.id} className="relative group/card">
              <button
                onClick={() => setChatModel(m.id as any)}
                className={`w-full p-3 rounded-xl border transition-all duration-300 text-left group ${
                  chatModel === m.id
                    ? 'bg-white/20 border-white/40 shadow-[0_0_20px_rgba(255,255,255,0.1)]'
                    : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                }`}
              >
                <div className="flex flex-col gap-1">
                  <div className="flex flex-col">
                    <span className={`text-xs font-bold transition-colors ${chatModel === m.id ? 'text-white' : 'text-zinc-300'}`}>
                      {m.name}
                    </span>
                    <span className="text-[8px] text-zinc-600 font-mono">
                      {m.id}
                    </span>
                  </div>
                  <span className="text-[10px] text-zinc-500 group-hover:text-zinc-400 transition-colors">
                    {m.desc}
                  </span>
                </div>
              </button>
              
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setShowGame({ show: true, type: m.dino as any });
                }}
                className="absolute bottom-2 right-2 p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-all z-10 group/game"
                title="启动跑酷小游戏"
              >
                <Gamepad2 className="w-4 h-4 text-white/60 group-hover/game:text-white transition-colors" />
              </button>
            </div>
          ))}
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-2 flex items-end gap-2 shrink-0">
          <button
            onClick={toggleLive}
            className="p-3 bg-white/20 text-white hover:bg-white/30 border border-white/30 rounded-xl transition-all flex items-center justify-center shrink-0"
            title="实时语音对线"
          >
            <Phone className="w-5 h-5" />
          </button>
          
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={t.zhangJingyangPlaceholder}
            className="flex-1 bg-transparent border-none text-white text-sm focus:ring-0 outline-none resize-none py-3 px-2 max-h-32 custom-scrollbar"
            rows={1}
            disabled={isLive || isTyping}
          />
          
          <button
            onClick={handleSend}
            disabled={!input.trim() || isTyping || isLive}
            className="p-3 bg-white/20 hover:bg-white/30 disabled:bg-white/10 disabled:text-white/40 text-white rounded-xl transition-all shrink-0"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
      
      <AnimatePresence>
        {showGame.show && (
          <DinoGame 
            dinoType={showGame.type} 
            onClose={() => setShowGame({ ...showGame, show: false })} 
            isAdmin={isAdmin}
            classPhotos={classPhotos}
            schoolLogoUrl={schoolLogoUrl}
            lang={lang}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
