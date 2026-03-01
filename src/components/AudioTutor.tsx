import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality, Type } from '@google/genai';
import { Mic, Loader2, Upload, AlertCircle, Play, Pause, X, FileImage, Trash2, StopCircle, Camera } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeKatex from 'rehype-katex';
import { motion, AnimatePresence } from 'framer-motion';
import { TRANSLATIONS } from '../constants';
import { addWavHeader } from '../utils/audioUtils';

import { Textbook } from './TextbookManager';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

function LiveQnA({ imageBase64, mimeType, lang }: { imageBase64: string, mimeType: string, lang: 'zh' | 'en' }) {
  const t = TRANSLATIONS[lang];
  const [isLive, setIsLive] = useState(false);
  const isLiveRef = useRef(false);
  const [status, setStatus] = useState('');
  const audioContextRef = useRef<AudioContext | null>(null);
  const sessionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  const startLive = async () => {
    try {
      setStatus(t.startLive + '...');
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;
      
      // Resume context if suspended (common in browsers)
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      
      source.connect(processor);
      processor.connect(audioContext.destination);
      
      const aiInstance = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const sessionPromise = aiInstance.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-09-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: `You are a helpful tutor. The user is asking questions about a homework problem. Be concise and conversational. You can see the homework problem in the image provided. Respond in ${lang === 'zh' ? 'Chinese' : 'English'}.`,
        },
        callbacks: {
          onopen: () => {
            setIsLive(true);
            isLiveRef.current = true;
            setStatus(t.listening);
            sessionPromise.then(session => {
               session.sendRealtimeInput({
                 media: { data: imageBase64, mimeType: mimeType }
               });
            });
          },
          onmessage: (message: any) => {
            if (message.serverContent?.interrupted) {
              nextPlayTimeRef.current = 0;
              activeSourcesRef.current.forEach(s => {
                try { s.stop(); } catch(e) {}
              });
              activeSourcesRef.current = [];
            }
            
            // Handle audio parts
            const parts = message.serverContent?.modelTurn?.parts;
            if (parts) {
              for (const part of parts) {
                if (part.inlineData?.data) {
                  setStatus(t.speaking);
                  playAudio(part.inlineData.data);
                }
              }
            }
          },
          onclose: () => {
            setIsLive(false);
            isLiveRef.current = false;
            setStatus('');
            stopAll();
          },
          onerror: (e: any) => {
            console.error("Live API Error:", e);
            setIsLive(false);
            isLiveRef.current = false;
            setStatus('Error');
            stopAll();
          }
        }
      });
      
      sessionRef.current = sessionPromise;
      
      processor.onaudioprocess = (e) => {
        if (!isLiveRef.current) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcm16[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
        }
        const base64 = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)));
        sessionPromise.then(session => {
          session.sendRealtimeInput({
            media: { data: base64, mimeType: 'audio/pcm;rate=16000' }
          });
        });
      };
    } catch (e) {
      console.error("Mic/Audio Error:", e);
      setStatus('Error starting mic');
    }
  };

  const playAudio = (base64: string) => {
    if (!audioContextRef.current) return;
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const pcm16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
      float32[i] = pcm16[i] / 32768;
    }
    const buffer = audioContextRef.current.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);
    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);
    
    const currentTime = audioContextRef.current.currentTime;
    if (nextPlayTimeRef.current < currentTime) {
      nextPlayTimeRef.current = currentTime;
    }
    source.start(nextPlayTimeRef.current);
    nextPlayTimeRef.current += buffer.duration;
    
    activeSourcesRef.current.push(source);
    source.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
      if (activeSourcesRef.current.length === 0) {
        setStatus(t.listening);
      }
    };
  };

  const stopAll = () => {
    isLiveRef.current = false;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    if (sessionRef.current) {
      sessionRef.current.then((s: any) => s.close());
    }
    setIsLive(false);
  };

  useEffect(() => {
    return () => {
      stopAll();
    };
  }, []);

  return (
    <div className="mt-6 p-6 bg-zinc-900/50 border border-white/10 rounded-2xl flex flex-col items-center gap-4 shadow-lg liquid-panel">
      <h3 className="text-lg font-bold text-white flex items-center gap-2">
        <Mic className="w-5 h-5" />
        {t.liveQnA}
      </h3>
      {isLive ? (
        <div className="flex flex-col items-center gap-4 w-full">
          <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center animate-pulse ring-4 ring-white/20">
            <Mic className="w-10 h-10 text-white" />
          </div>
          <p className="text-sm font-medium text-zinc-300">{status}</p>
          <button onClick={stopAll} className="px-6 py-2.5 bg-red-500/20 text-red-400 font-bold rounded-full hover:bg-red-500/30 transition-colors flex items-center gap-2 liquid-button">
            <StopCircle className="w-5 h-5" />
            {t.endLive}
          </button>
        </div>
      ) : (
        <button onClick={startLive} className="px-8 py-3.5 bg-white text-black font-bold rounded-full hover:bg-zinc-200 transition-all flex items-center gap-2 shadow-[0_0_30px_rgba(255,255,255,0.4)] active:scale-95">
          <Mic className="w-5 h-5" />
          {t.startLive}
        </button>
      )}
    </div>
  );
}

interface QuestionData {
  id: string;
  title: string;
  explanation: string;
  audioBase64?: string;
  isGeneratingAudio?: boolean;
}

export function AudioTutorView({ 
  files, 
  setFiles, 
  lang,
  associateTextbook,
  selectedTextbookIds,
  textbooks
}: { 
  files: File[], 
  setFiles: (f: File[]) => void, 
  lang: 'zh' | 'en',
  associateTextbook?: boolean,
  selectedTextbookIds?: string[],
  textbooks?: Textbook[]
}) {
  const t = TRANSLATIONS[lang];
  const [state, setState] = useState<'idle' | 'uploading' | 'generating' | 'done'>('idle');
  const [data, setData] = useState<{ 
    overallExplanation: string, 
    questions: QuestionData[], 
    imageBase64: string, 
    mimeType: string 
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFiles([e.target.files[0]]);
      e.target.value = '';
    }
  };

  const processFiles = (selectedFiles: FileList | File[]) => {
    const newFiles = Array.from(selectedFiles).filter(f => f.type.startsWith('image/'));
    if (newFiles.length > 0) {
      setFiles([newFiles[0]]);
    }
  };

  const handleGenerate = async () => {
    if (files.length === 0) return;
    setState('uploading');
    setError(null);
    
    try {
      await new Promise(resolve => setTimeout(resolve, 800)); // Simulate upload
      setState('generating');
      
      const f = files[0];
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(f);
      });

      let textbookParts: any[] = [];
      if (associateTextbook && selectedTextbookIds && selectedTextbookIds.length > 0 && textbooks) {
        for (const id of selectedTextbookIds) {
          const book = textbooks.find(b => b.id === id);
          if (book) {
            try {
              const response = await fetch(book.url);
              if (!response.ok) throw new Error('Failed to fetch PDF');
              const arrayBuffer = await response.arrayBuffer();
              const base64 = btoa(
                new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
              );
              textbookParts.push({ inlineData: { data: base64, mimeType: 'application/pdf' } });
            } catch (err) {
              console.error("Failed to fetch textbook PDF", err);
            }
          }
        }
      }

      const parts: any[] = [
        { inlineData: { data: base64Data, mimeType: f.type } }
      ];

      if (textbookParts.length > 0) {
        parts.push(...textbookParts);
        parts.push({ text: lang === 'zh' ? "请使用提供的 PDF 教材作为背景知识来解释图片中的问题。" : "Please use the provided PDF textbooks as context to explain the question in the image." });
      }

      parts.push({ text: lang === 'zh' ? `请分析提供的图片。其中包含一个或多个作业题目。
      1. 提供内容的简要总体总结。
      2. 识别每个单独的问题并为每个问题提供详细解释。
      
      请使用中文 (Chinese) 回答。
      
      以 JSON 格式返回结果：
      {
        "overallExplanation": "简要总结...",
        "questions": [
          {
            "id": "q1",
            "title": "问题 1",
            "explanation": "问题 1 的详细解释..."
          },
          ...
        ]
      }` : `Please analyze the provided image. It contains one or more homework questions. 
      1. Provide a brief overall summary of the content.
      2. Identify each individual question and provide a detailed explanation for each.
      
      Please respond in English.

      Return the result in JSON format:
      {
        "overallExplanation": "Brief summary...",
        "questions": [
          {
            "id": "q1",
            "title": "Question 1",
            "explanation": "Detailed explanation for question 1..."
          },
          ...
        ]
      }` });

      const textResponse = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: [
          {
            parts: parts
          }
        ],
        config: {
          systemInstruction: `You are a professional tutor. Analyze the homework image and provide explanations. 
          CRITICAL: You MUST respond in ${lang === 'zh' ? 'Chinese (Simplified)' : 'English'}. 
          All explanations, summaries, and titles must be in ${lang === 'zh' ? 'Chinese' : 'English'}.`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              overallExplanation: { type: Type.STRING },
              questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    title: { type: Type.STRING },
                    explanation: { type: Type.STRING }
                  },
                  required: ["id", "title", "explanation"]
                }
              }
            },
            required: ["overallExplanation", "questions"]
          }
        }
      });
      
      const result = JSON.parse(textResponse.text || '{}');
      
      setData({ 
        overallExplanation: result.overallExplanation || '', 
        questions: result.questions || [], 
        imageBase64: base64Data, 
        mimeType: f.type 
      });
      setState('done');
      
    } catch (err: any) {
      console.error(err);
      setError(err.message);
      setState('idle');
    }
  };

  const generateAudioForQuestion = async (questionId: string) => {
    if (!data) return;
    const question = data.questions.find(q => q.id === questionId);
    if (!question || question.audioBase64) return;

    // Update state to show loading
    setData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        questions: prev.questions.map(q => q.id === questionId ? { ...q, isGeneratingAudio: true } : q)
      };
    });

    try {
      const audioResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: question.explanation }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: lang === 'zh' ? 'Aoede' : 'Kore' },
            },
          },
        },
      });
      
      const audioBase64 = audioResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (audioBase64) {
        const processedAudio = addWavHeader(audioBase64, 24000);
        setData(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            questions: prev.questions.map(q => q.id === questionId ? { ...q, audioBase64: processedAudio, isGeneratingAudio: false } : q)
          };
        });
      }
    } catch (err) {
      console.error("Failed to generate audio for question", err);
      setData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          questions: prev.questions.map(q => q.id === questionId ? { ...q, isGeneratingAudio: false } : q)
        };
      });
    }
  };

  const togglePlay = (id: string) => {
    const audio = audioRefs.current[id];
    if (audio) {
      if (playingAudioId === id) {
        audio.pause();
        setPlayingAudioId(null);
      } else {
        // Stop other playing audio
        if (playingAudioId && audioRefs.current[playingAudioId]) {
          audioRefs.current[playingAudioId].pause();
        }
        audio.play();
        setPlayingAudioId(id);
      }
    }
  };

  const clear = () => {
    setFiles([]);
    setData(null);
    setState('idle');
    setError(null);
    setPlayingAudioId(null);
  };

  if (state === 'uploading' || state === 'generating') {
    return (
      <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-white/10 backdrop-blur-2xl liquid-panel">
        <Loader2 className="w-12 h-12 text-white animate-spin mb-6" />
        <h3 className="text-xl font-bold text-white mb-2">
          {state === 'uploading' ? t.uploading : t.generating}
        </h3>
        <p className="text-zinc-400 text-sm">
          {state === 'generating' ? (lang === 'zh' ? '正在为您深度解析题目...' : 'Analyzing questions in depth...') : ''}
        </p>
      </div>
    );
  }

  if (state === 'done' && data) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        <div className="flex items-center justify-between">
          <button onClick={clear} className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm transition-colors liquid-button">
            {t.back}
          </button>
        </div>

        <div className="rounded-2xl border border-white/10 p-6 backdrop-blur-2xl shadow-2xl liquid-panel">
          <div className="flex flex-col items-center gap-6">
            <div className="w-full max-w-md aspect-video bg-zinc-900 rounded-xl overflow-hidden border border-white/10">
              <img src={`data:${data.mimeType};base64,${data.imageBase64}`} alt="Question" className="w-full h-full object-contain" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 p-6 backdrop-blur-2xl liquid-panel">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <FileImage className="w-5 h-5 text-white" />
            {t.textContent}
          </h3>
          <div className="prose prose-invert prose-zinc max-w-none text-zinc-300 leading-relaxed mb-8">
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]} rehypePlugins={[rehypeKatex]}>
              {data.overallExplanation}
            </ReactMarkdown>
          </div>

          <div className="space-y-8">
            {data.questions.map((q) => (
              <div key={q.id} className="p-6 rounded-xl bg-white/5 border border-white/10 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-bold text-white">{q.title}</h4>
                  <div className="flex items-center gap-3">
                    {q.audioBase64 ? (
                      <button 
                        onClick={() => togglePlay(q.id)}
                        className="w-12 h-12 bg-white rounded-full flex items-center justify-center hover:bg-zinc-200 transition-all shadow-lg active:scale-95"
                      >
                        {playingAudioId === q.id ? <Pause className="w-5 h-5 text-black" /> : <Play className="w-5 h-5 text-black ml-0.5" />}
                        <audio 
                          ref={el => { if (el) audioRefs.current[q.id] = el; }}
                          src={`data:audio/wav;base64,${q.audioBase64}`} 
                          onEnded={() => setPlayingAudioId(null)}
                          className="hidden"
                        />
                      </button>
                    ) : (
                      <button 
                        onClick={() => generateAudioForQuestion(q.id)}
                        disabled={q.isGeneratingAudio}
                        className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs transition-colors flex items-center gap-2"
                      >
                        {q.isGeneratingAudio ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                        {lang === 'zh' ? '生成语音讲解' : 'Generate Audio'}
                      </button>
                    )}
                  </div>
                </div>
                <div className="prose prose-invert prose-zinc max-w-none text-zinc-400 text-sm leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]} rehypePlugins={[rehypeKatex]}>
                    {q.explanation}
                  </ReactMarkdown>
                </div>
              </div>
            ))}
          </div>
        </div>

        <LiveQnA imageBase64={data.imageBase64} mimeType={data.mimeType} lang={lang} />
      </motion.div>
    );
  }

  return (
    <div className="p-1 rounded-2xl border border-white/10 backdrop-blur-2xl shadow-2xl liquid-panel">
      <div className="p-3 md:p-4 rounded-xl border border-white/5 backdrop-blur-2xl space-y-4 liquid-panel">
        {/* Hidden Inputs */}
        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
        <input type="file" ref={cameraInputRef} onChange={handleFileChange} accept="image/*" capture="environment" className="hidden" />

        {files.length === 0 ? (
          <div className="flex flex-col md:flex-row gap-2">
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files) processFiles(e.dataTransfer.files); }}
              onClick={() => fileInputRef.current?.click()}
              className={`
                flex-1 relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-500
                ${isDragging ? 'border-white bg-white/10 scale-[0.99]' : 'border-white/10 hover:border-white/30 hover:bg-white/5'}
              `}
            >
              <div className="flex flex-col items-center gap-2">
                <div className="p-2 rounded-lg bg-black/50 text-zinc-400">
                  <Upload className="w-4 h-4" />
                </div>
                <p className="text-zinc-300 text-xs font-medium">{t.upload}</p>
              </div>
            </div>

            <div
              onClick={() => cameraInputRef.current?.click()}
              className="md:w-32 relative border-2 border-white/10 rounded-xl p-6 text-center cursor-pointer hover:border-white/30 hover:bg-white/5 transition-all duration-500 group"
            >
              <div className="flex flex-col items-center gap-2">
                <div className="p-2 rounded-lg bg-black/50 text-zinc-400 group-hover:bg-white group-hover:text-black transition-colors">
                  <Camera className="w-4 h-4" />
                </div>
                <p className="text-zinc-300 text-xs font-medium">{t.camera}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
              <div className="relative w-24 md:w-28 aspect-[3/4] bg-black/50 rounded-lg overflow-hidden border border-white/10 group shrink-0 shadow-xl">
                <img src={URL.createObjectURL(files[0])} alt="Preview" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                <button onClick={() => setFiles([])} className="absolute top-1 right-1 p-1 bg-black/60 backdrop-blur-md text-zinc-300 rounded-full hover:bg-red-500 hover:text-white transition-all shadow-lg">
                  <Trash2 className="w-2 h-2" />
                </button>
              </div>
            </div>
            
            <div className="flex items-center justify-between pt-2 border-t border-white/10">
              <div className="text-xs text-zinc-400">
                {files.length} {t.selected}
              </div>
              <button 
                onClick={handleGenerate}
                className="px-6 py-2 bg-white text-black text-sm font-bold rounded-lg hover:bg-zinc-200 transition-all shadow-[0_0_20px_rgba(255,255,255,0.4)] flex items-center gap-2 active:scale-95"
              >
                <Play className="w-4 h-4" />
                {t.start}
              </button>
            </div>
            {error && (
              <div className="flex items-center gap-2 text-red-400 bg-red-500/10 px-4 py-2 rounded-lg border border-red-500/20">
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm">{error}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
