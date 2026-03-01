import React, { useState, useRef } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { Mic, Square, Play, RefreshCw, CheckCircle, AlertCircle, Loader2, BookOpen } from 'lucide-react';
import { TRANSLATIONS } from '../constants';

interface ReadingMaterial {
  englishText: string;
  chineseTranslation: string;
  keyWords: { word: string; meaning: string }[];
}

export default function ReadingCorrection({ lang, model }: { lang: 'zh' | 'en', model: string }) {
  const [material, setMaterial] = useState<ReadingMaterial | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [correctionResult, setCorrectionResult] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioBlobRef = useRef<Blob | null>(null);

  const t = TRANSLATIONS[lang];

  const generateMaterial = async () => {
    setIsGenerating(true);
    setMaterial(null);
    setCorrectionResult(null);
    setAudioUrl(null);
    audioBlobRef.current = null;
    
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("API key not found");
      const ai = new GoogleGenAI({ apiKey });

      const prompt = `Please generate a short English reading passage (about 100-150 words) suitable for high school students to practice listening and reading aloud. It should be similar in style and difficulty to the Beijing Gaokao English Listening Text 10 (monologue). Topics can be about study tips, creativity, reading, environment, health, or lifestyle.
      
      Return the result in JSON format with the following structure:
      {
        "englishText": "The English passage...",
        "chineseTranslation": "The Chinese translation...",
        "keyWords": [
          {"word": "creativity", "meaning": "创造力"},
          ...
        ]
      }`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview', // Flash is fast enough for this
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              englishText: { type: Type.STRING },
              chineseTranslation: { type: Type.STRING },
              keyWords: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    word: { type: Type.STRING },
                    meaning: { type: Type.STRING }
                  },
                  required: ["word", "meaning"]
                }
              }
            },
            required: ["englishText", "chineseTranslation", "keyWords"]
          }
        }
      });

      if (response.text) {
        const data = JSON.parse(response.text);
        setMaterial(data);
      }
    } catch (err) {
      console.error("Failed to generate material:", err);
      alert(lang === 'zh' ? '生成素材失败，请重试。' : 'Failed to generate material, please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        audioBlobRef.current = audioBlob;
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setCorrectionResult(null);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert(lang === 'zh' ? '无法访问麦克风，请检查权限。' : 'Cannot access microphone, please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const evaluatePronunciation = async () => {
    if (!audioBlobRef.current || !material) return;
    
    setIsCorrecting(true);
    setCorrectionResult(null);
    
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("API key not found");
      const ai = new GoogleGenAI({ apiKey });

      // Convert blob to base64
      const reader = new FileReader();
      reader.readAsDataURL(audioBlobRef.current);
      
      const base64Audio = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const base64data = reader.result as string;
          // Remove the data URL prefix (e.g., "data:audio/webm;base64,")
          const base64 = base64data.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
      });

      const prompt = `The user has read the following English passage aloud. I will provide the audio recording.
      
Passage:
${material.englishText}

Please listen to the audio and evaluate their pronunciation. Point out any mispronounced words, unnatural intonation, or areas for improvement. Be encouraging and provide specific corrections. Return the evaluation in ${lang === 'zh' ? 'Chinese' : 'English'}.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              { inlineData: { data: base64Audio, mimeType: 'audio/webm' } }
            ]
          }
        ]
      });

      setCorrectionResult(response.text || (lang === 'zh' ? '无法获取评估结果。' : 'Could not get evaluation result.'));
    } catch (err) {
      console.error("Failed to evaluate pronunciation:", err);
      alert(lang === 'zh' ? '评估失败，请重试。' : 'Evaluation failed, please try again.');
    } finally {
      setIsCorrecting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div className="flex justify-between items-center bg-zinc-900/50 p-4 rounded-2xl border border-white/10 liquid-panel">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-white" />
            {lang === 'zh' ? 'AI 朗读纠错' : 'AI Reading Correction'}
          </h2>
          <p className="text-sm text-zinc-400 mt-1">
            {lang === 'zh' ? '生成高考听力风格的短文，朗读并获取发音纠正。' : 'Generate Gaokao-style passages, read aloud, and get pronunciation corrections.'}
          </p>
        </div>
        <button
          onClick={generateMaterial}
          disabled={isGenerating || isRecording}
          className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-zinc-200 disabled:bg-white/50 text-black rounded-xl transition-colors font-medium shadow-[0_0_20px_rgba(255,255,255,0.4)] active:scale-95"
        >
          {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {lang === 'zh' ? '生成新素材' : 'Generate Material'}
        </button>
      </div>

      {material && (
        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-4">
            <div className="bg-zinc-900/80 p-6 rounded-2xl border border-white/10 shadow-xl relative liquid-panel">
              <h3 className="text-lg font-semibold text-white mb-4 border-b border-white/10 pb-2">
                {lang === 'zh' ? '朗读文本' : 'Reading Text'}
              </h3>
              <p className="text-lg leading-relaxed text-zinc-200 font-serif whitespace-pre-wrap">
                {material.englishText}
              </p>
              
              <div className="mt-8 pt-6 border-t border-white/10">
                <h4 className="text-sm font-medium text-zinc-400 mb-2">
                  {lang === 'zh' ? '参考译文' : 'Translation'}
                </h4>
                <p className="text-sm text-zinc-500 leading-relaxed">
                  {material.chineseTranslation}
                </p>
              </div>
            </div>

            <div className="bg-zinc-900/80 p-6 rounded-2xl border border-white/10 shadow-xl flex flex-col items-center justify-center gap-4 liquid-panel">
              {!isRecording && !audioUrl && (
                <button
                  onClick={startRecording}
                  className="w-20 h-20 rounded-full bg-white hover:bg-zinc-200 flex items-center justify-center text-black shadow-[0_0_40px_rgba(255,255,255,0.5)] transition-all active:scale-95"
                >
                  <Mic className="w-8 h-8" />
                </button>
              )}
              
              {isRecording && (
                <button
                  onClick={stopRecording}
                  className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center text-white shadow-[0_0_30px_rgba(239,68,68,0.4)] transition-all animate-pulse liquid-button-active"
                >
                  <Square className="w-8 h-8" />
                </button>
              )}
  
              {audioUrl && !isRecording && (
                <div className="flex flex-col items-center gap-4 w-full">
                  <audio src={audioUrl} controls className="w-full max-w-md" />
                  <div className="flex gap-4">
                    <button
                      onClick={startRecording}
                      className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-sm transition-colors liquid-button"
                    >
                      {lang === 'zh' ? '重新录音' : 'Record Again'}
                    </button>
                    <button
                      onClick={evaluatePronunciation}
                      disabled={isCorrecting}
                      className="px-6 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/50 text-white font-medium transition-colors flex items-center gap-2 liquid-button-active"
                    >
                      {isCorrecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                      {lang === 'zh' ? '提交评估' : 'Evaluate'}
                    </button>
                  </div>
                </div>
              )}
              
              <p className="text-sm text-zinc-400">
                {isRecording 
                  ? (lang === 'zh' ? '正在录音... 点击停止' : 'Recording... Click to stop') 
                  : audioUrl 
                    ? (lang === 'zh' ? '录音完成，可播放或提交评估' : 'Recording finished. Play or evaluate.')
                    : (lang === 'zh' ? '点击麦克风开始朗读' : 'Click microphone to start reading')}
              </p>
            </div>

            {correctionResult && (
              <div className="bg-emerald-900/20 p-6 rounded-2xl border border-emerald-500/30 shadow-xl liquid-panel">
                <h3 className="text-lg font-semibold text-emerald-400 mb-4 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5" />
                  {lang === 'zh' ? '发音评估结果' : 'Evaluation Result'}
                </h3>
                <div className="prose prose-invert prose-emerald max-w-none text-sm leading-relaxed whitespace-pre-wrap">
                  {correctionResult}
                </div>
              </div>
            )}
          </div>
  
          <div className="space-y-4">
            <div className="bg-zinc-900/80 p-6 rounded-2xl border border-white/10 shadow-xl sticky top-4 liquid-panel">
              <h3 className="text-lg font-semibold text-white mb-4 border-b border-white/10 pb-2">
                {lang === 'zh' ? '重点词汇' : 'Key Words'}
              </h3>
              <ul className="space-y-3">
                {material.keyWords.map((kw, idx) => (
                  <li key={idx} className="flex flex-col gap-1 bg-black/20 p-3 rounded-xl border border-white/5 liquid-panel">
                    <span className="font-medium text-white">{kw.word}</span>
                    <span className="text-sm text-zinc-400">{kw.meaning}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
      
      {!material && !isGenerating && (
        <div className="text-center py-20 text-zinc-500">
          <BookOpen className="w-16 h-16 mx-auto mb-4 opacity-20" />
          <p>{lang === 'zh' ? '点击右上角“生成新素材”开始练习' : 'Click "Generate Material" to start practicing'}</p>
        </div>
      )}
    </div>
  );
}
