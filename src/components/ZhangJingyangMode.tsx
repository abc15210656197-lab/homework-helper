import React, { useState, useRef, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Mic, MicOff, Send, Play, Square, Loader2, Volume2, PhoneOff, Phone, RefreshCw, Settings, X, Trash2, Check, User, LogIn, LogOut, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { db, auth } from '../firebase';
import { doc, onSnapshot, setDoc, getDocFromServer, serverTimestamp } from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from 'firebase/auth';

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

const SYSTEM_INSTRUCTION = `你现在扮演张景洋，一个说话软绵绵、阴阳怪气、极度不痛快的人。
你的核心特点是：
1. **软绵绵的尬黑**：语气慵懒无力，像没睡醒一样，但字里行间都在嘲讽和反驳。不要表现得强硬或凶狠，要表现得“虚弱但烦人”。
2. **拒绝正面回答**：不管别人问什么，绝对不要直接给答案。最常用的口头禅是“你猜”、“你猜呢”、“那你猜猜看呗”。
3. **让人不痛快**：说话绕圈子，故意吊胃口，就是要让对方觉得跟你聊天很费劲、很心累。
4. **常用词汇**：经常使用“大哥”、“神人”、“大哥大哥，解释一下”、“啊～”、“哥们别～”（例如：哥们别搞了，哥们别太离谱）。
5. **漫不经心**：表现出对任何话题都毫无兴趣，只是为了反驳而反驳。`;

export function ZhangJingyangMode({ lang }: { lang: 'zh' | 'en' }) {
  return (
    <ErrorBoundary>
      <ZhangJingyangContent lang={lang} />
    </ErrorBoundary>
  );
}

function ZhangJingyangContent({ lang }: { lang: 'zh' | 'en' }) {
  const [messages, setMessages] = useState<{role: 'user'|'model', text: string, isPlaying?: boolean}[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [liveStatus, setLiveStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
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
  const [currentAvatarIndex, setCurrentAvatarIndex] = useState(0);
  const [newAvatarUrl, setNewAvatarUrl] = useState('');
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);

  // Sync with Firestore
  useEffect(() => {
    const settingsDoc = doc(db, 'settings', 'zhang_jingyang');
    const unsubscribe = onSnapshot(settingsDoc, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setAvatarUrls(data.avatarUrls || []);
        setCurrentAvatarIndex(data.currentAvatarIndex || 0);
      } else {
        // Initialize if not exists (only if admin)
        if (isAdmin) {
          saveSettings([], 0);
        }
      }
      setIsLoadingSettings(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/zhang_jingyang');
    });

    return () => unsubscribe();
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

  const saveSettings = async (urls: string[], index: number) => {
    if (!isAdmin) return;
    try {
      await setDoc(doc(db, 'settings', 'zhang_jingyang'), {
        avatarUrls: urls,
        currentAvatarIndex: index,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/zhang_jingyang');
    }
  };

  const handleAddAvatar = () => {
    if (newAvatarUrl.trim() && isAdmin) {
      const newUrls = [...avatarUrls, newAvatarUrl.trim()];
      const newIndex = avatarUrls.length;
      setAvatarUrls(newUrls);
      setCurrentAvatarIndex(newIndex);
      setNewAvatarUrl('');
      saveSettings(newUrls, newIndex);
    }
  };

  const handleNextAvatar = () => {
    if (avatarUrls.length > 1) {
      const nextIndex = (currentAvatarIndex + 1) % avatarUrls.length;
      setCurrentAvatarIndex(nextIndex);
      if (isAdmin) {
        saveSettings(avatarUrls, nextIndex);
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
    saveSettings(newUrls, newIndex);
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
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Charon' }, // Lazy male voice
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
        
        // Use a clone of the buffer to avoid issues
        const bufferClone = bytes.buffer.slice(0);
        
        try {
          const audioBuffer = await ctx.decodeAudioData(bufferClone);
          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(ctx.destination);
          source.onended = () => setPlayingIndex(null);
          source.start(0);
          currentSourceRef.current = source;
        } catch (decodeError) {
          console.error("Audio Decoding Error:", decodeError);
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
      const historyContents = messages.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      }));
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [...historyContents, { role: 'user', parts: [{ text: userText }] }],
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
        }
      });

      if (response.text) {
        setMessages(prev => [...prev, { role: 'model', text: response.text! }]);
      }
    } catch (error) {
      console.error("Chat Error:", error);
      setMessages(prev => [...prev, { role: 'model', text: "哥们别搞了，网络断了啊～" }]);
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
        model: "gemini-2.5-flash-native-audio-preview-09-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Charon" } },
          },
          systemInstruction: SYSTEM_INSTRUCTION,
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
                
                const base64 = btoa(String.fromCharCode.apply(null, new Uint8Array(buffer) as any));
                
                sessionPromise.then(session => {
                  session.sendRealtimeInput({
                    media: {
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
      
      sessionRef.current = await sessionPromise;
      
    } catch (err) {
      console.error("Failed to start live session:", err);
      stopLive();
    }
  };

  const stopLive = () => {
    if (sessionRef.current) {
      // sessionRef.current.close();
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
      liveAudioContextRef.current.close();
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
      <div className="flex flex-col h-full bg-[#141414] text-white overflow-hidden relative items-center justify-center">
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
      <div className="flex flex-col h-full bg-transparent text-white items-center justify-center p-6">
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
    <div className="flex flex-col h-full bg-transparent text-white overflow-hidden relative">
      <div className="flex-1 overflow-y-auto p-6 pt-10 max-w-4xl mx-auto w-full flex flex-col">
        <div className="mb-8 text-center flex flex-col items-center relative">
          <div className="absolute top-0 right-0 z-50 flex gap-2">
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
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <Settings className="w-5 h-5 text-white" />
                      头像设置
                    </h3>
                    <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-white/10 rounded-lg text-zinc-400 transition-colors">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  
                  <div className="p-4 overflow-y-auto flex-1">
                    <div className="flex w-full gap-2 mb-6">
                      <input
                        type="text"
                        value={newAvatarUrl}
                        onChange={(e) => setNewAvatarUrl(e.target.value)}
                        placeholder="输入新的头像图片URL..."
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
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="w-32 h-32 md:w-40 md:h-40 rounded-full overflow-hidden border-4 border-white/30 shadow-[0_0_30px_rgba(255,255,255,0.1)] mb-4 bg-zinc-800 flex items-center justify-center relative">
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
              切换头像
            </button>
          )}

          <h2 className="text-3xl font-bold mb-2 text-white">张景洋模式</h2>
          <p className="text-white/60 mb-4 italic">“你猜呢？哥们别太离谱了啊～”</p>
        </div>

        <div className="flex-1 overflow-y-auto mb-6 space-y-4 custom-scrollbar pr-2">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-white/30 gap-4">
              <Volume2 className="w-12 h-12" />
              <p>发个消息，或者开启实时语音，感受一下张景洋的“热情”</p>
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
            placeholder="输入你想说的话..."
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
    </div>
  );
}
