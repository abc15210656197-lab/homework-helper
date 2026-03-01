import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { Mic, Loader2, Upload, AlertCircle, Play, Pause, X, FileImage, Trash2, StopCircle, Camera } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeKatex from 'rehype-katex';
import { motion, AnimatePresence } from 'framer-motion';
import { TRANSLATIONS } from '../constants';

import { Textbook } from './TextbookManager';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

function LiveQnA({ imageBase64, mimeType, lang }: { imageBase64: string, mimeType: string, lang: 'zh' | 'en' }) {
  const t = TRANSLATIONS[lang];
  const [isLive, setIsLive] = useState(false);
  const [status, setStatus] = useState('');
  const audioContextRef = useRef<AudioContext | null>(null);
  const sessionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  const startLive = async () => {
    try {
      setStatus(t.startLive + '...');
      audioContextRef.current = new AudioContext({ sampleRate: 16000 });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const source = audioContextRef.current.createMediaStreamSource(stream);
      const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
      
      source.connect(processor);
      processor.connect(audioContextRef.current.destination);
      
      const sessionPromise = ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-09-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: "You are a helpful tutor. The user is asking questions about a homework problem. Be concise and conversational.",
        },
        callbacks: {
          onopen: () => {
            setIsLive(true);
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
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio) {
              setStatus(t.speaking);
              playAudio(base64Audio);
            }
          },
          onclose: () => {
            setIsLive(false);
            setStatus('');
            stopAll();
          },
          onerror: (e: any) => {
            console.error(e);
            setIsLive(false);
            setStatus('Error');
            stopAll();
          }
        }
      });
      
      sessionRef.current = sessionPromise;
      
      processor.onaudioprocess = (e) => {
        if (!isLive) return;
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
      console.error(e);
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
  const [data, setData] = useState<{ text: string, audioBase64: string, imageBase64: string, mimeType: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
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
        parts.push({ text: "Please use the provided PDF textbooks as context to explain the question in the image." });
      }

      parts.push({ text: t.audioTutorPrompt });

      const textResponse = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: [
          {
            parts: parts
          }
        ]
      });
      
      const explanationText = textResponse.text || '';
      
      const audioResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: explanationText }] }],
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
      
      if (!audioBase64) throw new Error('Failed to generate audio');
      
      setData({ text: explanationText, audioBase64, imageBase64: base64Data, mimeType: f.type });
      setState('done');
      
    } catch (err: any) {
      console.error(err);
      setError(err.message);
      setState('idle');
    }
  };

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const clear = () => {
    setFiles([]);
    setData(null);
    setState('idle');
    setError(null);
  };

  if (state === 'uploading' || state === 'generating') {
    return (
      <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-white/10 backdrop-blur-2xl liquid-panel">
        <Loader2 className="w-12 h-12 text-white animate-spin mb-6" />
        <h3 className="text-xl font-bold text-white mb-2">
          {state === 'uploading' ? t.uploading : t.generating}
        </h3>
        <p className="text-zinc-400 text-sm">
          {state === 'generating' ? (lang === 'zh' ? '正在为您生成专属语音讲解...' : 'Generating your personalized audio explanation...') : ''}
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
            
            <audio 
              ref={audioRef} 
              src={`data:audio/wav;base64,${data.audioBase64}`} 
              onEnded={() => setIsPlaying(false)}
              onPause={() => setIsPlaying(false)}
              onPlay={() => setIsPlaying(true)}
              className="hidden"
            />
            
            <button 
              onClick={togglePlay}
              className="w-20 h-20 bg-white rounded-full flex items-center justify-center hover:bg-zinc-200 transition-all shadow-[0_0_40px_rgba(255,255,255,0.5)] active:scale-95"
            >
              {isPlaying ? <Pause className="w-8 h-8 text-black" /> : <Play className="w-8 h-8 text-black ml-1" />}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 p-6 backdrop-blur-2xl liquid-panel">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <FileImage className="w-5 h-5 text-white" />
            {t.textContent}
          </h3>
          <div className="prose prose-invert prose-zinc max-w-none text-zinc-300 leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]} rehypePlugins={[rehypeKatex]}>
              {data.text}
            </ReactMarkdown>
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
