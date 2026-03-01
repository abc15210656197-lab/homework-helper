import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Play, RefreshCw, BookOpen, CheckCircle, AlertCircle, FileText, Plus, Loader2, ChevronDown } from 'lucide-react';
import { GoogleGenAI, Type, Modality } from '@google/genai';
import ReactMarkdown from 'react-markdown';

const ARTICLES: {
  id: string;
  title: string;
  content: string;
  translation?: string;
  keyWords?: {word: string, meaning: string}[];
}[] = [
  {
    id: 'bj-2025',
    title: '2025年北京卷 - AI Tips',
    content: `Hello, everyone! Today I’d like to share some tips on how to make AI work for you.

First, face AI with an open mind. Hold the belief that AI is capable of helping us in many ways. Second, be an active user. Don’t just passively accept what AI gives you. Educate yourself about the latest developments of AI. Third, try to train AI continuously. You can provide feedback to improve its performance. Fourth, keep AI in a helpful way. Be aware of its potential risks, such as privacy issues. Finally, strike a balance between AI and human intelligence. Remember, AI is a tool, not a replacement for human thinking.

By following these suggestions, you can make the most of AI in your study and daily life.`
  },
  {
    id: 'bj-2024',
    title: '2024年北京卷 - Creativity',
    content: `Hello, everyone. I am Sam Smith. Being creative is important in solving problems. Here are some ways to develop your creativity.

First, keep an open mind. Be curious about new things and don’t be afraid to ask questions. Second, learn from different fields. Creativity often comes from connecting ideas from different areas. Third, take breaks. Sometimes, the best ideas come when you are not thinking hard about a problem. Fourth, practice brainstorming. Write down all your ideas, no matter how silly they seem. Finally, don’t fear failure. Every failed attempt is a step toward success.

Creativity is not just for artists. It can help you in all aspects of life. Start practicing today and you will see the difference.`
  },
  {
    id: 'bj-2023',
    title: '2023年北京卷 - Reading',
    content: `Good morning, everyone. Today I want to talk about the importance of reading.

Reading can open up a whole new world for us. It helps us learn about different cultures, histories, and people. Through reading, we can gain knowledge and improve our language skills. It also enriches our minds and makes us more thoughtful.

However, many people don’t read enough these days. They spend too much time on electronic devices. I suggest you set aside some time every day for reading. Start with books you are interested in. You can read novels, biographies, or magazines.

Reading is a lifelong journey. Let’s make reading a part of our daily life and enjoy the pleasure it brings.`
  },
  {
    id: 'nat-2025',
    title: '2025年新高考I卷 - Climate Art',
    content: `Good evening. Tonight I’ll continue to share how we can use art to spread the word about the changing climate. In our daily lives, climate change can be hard to see. But some places will feel the changes sooner than others. The city I live in is very flat and close to the waterline, and rising sea levels are already creating floods. So I decided to do something to make it impossible to ignore.

I started an art project. I painted numbers on thousands of large signs. Each number showed how high someone’s house was above sea level. A one would mean that if the sea level rose one foot, the building would flood. I gave the signs to homeowners who put them in their yards. Kids painted more signs and put them near their schools and along busy roads.

The project has already had a real-world effect. The people who put the signs in their yards created a real homeowners association to address climate change in their communities.`
  },
  {
    id: 'nat-2024',
    title: '2024年新课标I卷 - Environment',
    content: `Good morning, everyone. Today I’d like to talk about what we can do to protect the environment in our daily lives.

First, save electricity. Turn off lights and electrical appliances when not in use. Second, save water. Take shorter showers and fix dripping taps. Third, reduce waste. Use reusable bags instead of plastic ones, and recycle paper, bottles and cans.

Small actions can make a big difference. Let’s work together to make our planet greener.`
  },
  {
    id: 'nat-2023-yi',
    title: '2023年全国乙卷 - Health',
    content: `Hello, everyone. Today’s topic is how to keep healthy.

First, eat a balanced diet. We should have more fruits and vegetables, and less junk food. Second, do regular exercise. It can be walking, running, or playing sports. Third, get enough sleep. Adults need at least seven hours of sleep every night. Finally, stay positive. A good mood is good for our health.

If we follow these suggestions, we can live a healthy and happy life.`
  },
  {
    id: 'nat-2023-i',
    title: '2023年新高考I卷 - The Idler',
    content: `Good evening, dear listeners. When was the last time you enjoyed leisure activities? Do you want to live a full and happy life? Today, I’m going to introduce you to a magazine that features the art of living.

The Idler was launched by Tom Hodgkinson back in 1993, with the intention of providing a bit of fun, freedom and achievement in the busy world. It is now published bimonthly. In every issue, you will find an interesting mix of interviews and essays on the good life, history, philosophy, arts and fashion photography. You will find much to laugh at and much to learn, from recipes for making bacon to guides for housekeeping.

If you ever felt that there is more to life than boring jobs, why not subscribe to it? The Idler is a cheering read that makes you feel better about life. You can download the application and subscribe today to get your first issue free.`
  }
];

interface ReadingCoachProps {
  lang: 'zh' | 'en';
}

export function ReadingCoach({ lang }: ReadingCoachProps) {
  const [selectedArticleId, setSelectedArticleId] = useState(ARTICLES[0].id);
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState<string | null>(null);
  const [evaluationScore, setEvaluationScore] = useState<number | null>(null);
  const [mispronouncedWords, setMispronouncedWords] = useState<string[]>([]);
  const [inaccurateWords, setInaccurateWords] = useState<string[]>([]);
  const [recordingTime, setRecordingTime] = useState(0);
  const [standardAudioUrl, setStandardAudioUrl] = useState<string | null>(null);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [isMaterialListOpen, setIsMaterialListOpen] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);

  const [generatedArticles, setGeneratedArticles] = useState<{
    id: string, 
    title: string, 
    content: string,
    translation?: string,
    keyWords?: {word: string, meaning: string}[]
  }[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  
  const allArticles = [...ARTICLES, ...generatedArticles];
  const selectedArticle = allArticles.find(a => a.id === selectedArticleId) || allArticles[0];

  useEffect(() => {
    if (isRecording) {
      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  const generateNewArticle = async () => {
    setIsGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `Please generate a short English reading passage (about 100-150 words) suitable for high school students to practice listening and reading aloud. It should be a monologue similar in style and difficulty to the Beijing Gaokao English Listening Text 10. Topics can be about study tips, creativity, reading, environment, health, or lifestyle.
      
      Return the result in JSON format with the following structure:
      {
        "title": "A short, catchy title",
        "content": "The English passage...",
        "translation": "The Chinese translation of the passage...",
        "keyWords": [
          {"word": "creativity", "meaning": "创造力"},
          {"word": "environment", "meaning": "环境"}
        ]
      }`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              content: { type: Type.STRING },
              translation: { type: Type.STRING },
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
            required: ["title", "content", "translation", "keyWords"]
          }
        }
      });

      if (response.text) {
        const data = JSON.parse(response.text);
        const newArticle = {
          id: `ai-gen-${Date.now()}`,
          title: `AI: ${data.title}`,
          content: data.content,
          translation: data.translation,
          keyWords: data.keyWords
        };
        setGeneratedArticles(prev => [newArticle, ...prev]);
        setSelectedArticleId(newArticle.id);
        setEvaluationResult(null);
        setEvaluationScore(null);
        setMispronouncedWords([]);
        setAudioBlob(null);
        setAudioUrl(null);
        setStandardAudioUrl(null);
      }
    } catch (err) {
      console.error("Failed to generate article:", err);
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

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      setEvaluationResult(null);
      setEvaluationScore(null);
      setMispronouncedWords([]);
      setAudioBlob(null);
      setAudioUrl(null);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert(lang === 'zh' ? '无法访问麦克风，请检查权限设置。' : 'Cannot access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const evaluateAudio = async () => {
    if (!audioBlob) return;

    setIsEvaluating(true);
    setEvaluationResult(null);
    setEvaluationScore(null);
    setMispronouncedWords([]);
    setInaccurateWords([]);

    try {
      const base64data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            resolve(reader.result.split(',')[1]);
          } else {
            reject(new Error('Failed to read audio data'));
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });

      const mimeType = audioBlob.type || 'audio/webm';

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const systemInstruction = `You are an expert English pronunciation coach. The user is reading the following text (or a part of it):

"""
${selectedArticle.content}
"""

Listen to the user's audio recording.
IMPORTANT:
1. The user might have only read the beginning of the text. ONLY evaluate the parts they actually spoke.
2. Do NOT provide feedback on the parts they did not read.
3. If they stopped early, simply ignore the rest of the text.
4. Provide detailed feedback on their pronunciation, fluency, and intonation for the spoken part.
5. Evaluate the reading based on the following criteria (Score range: 0-8):
   - 8 points (Full Score): Read the full text completely, mispronounced words <= 3; accurate sense group division, reasonable pauses; natural and standard intonation, fitting the text's emotion; fluent and coherent reading, no stuttering, repetition, or duplication issues.
   - 5-7 points: Read the full text completely, mispronounced words 3-5; some improper pauses in individual sentences, slight flaws in sense group division; intonation basically accurate, no serious pronunciation errors; overall reading basically fluent, only very few stutters or self-corrections, not affecting semantic understanding.
   - 1-4 points: Failed to read the full text completely, missed words, missed sentences, frequent stuttering or repetition; mispronounced words > 5, multiple serious pronunciation errors; chaotic sense group division, improper pauses; poor intonation and fluency, affecting text semantic transmission.
   - 0 points: Did not open mouth to read at all, reading content completely inconsistent with text, or no valid recording throughout.
   
   Note: 
   - 'mispronouncedWords' (Red): Words that are missed (漏读), completely wrong (错读), or repeated (回读).
   - 'inaccurateWords' (Orange): Words that are not standard, have wrong stress, or off intonation, but are still recognizable (发音不准).

6. Return the result in JSON format with the following structure:
{
  "feedback": "Detailed feedback in ${lang === 'zh' ? 'Chinese' : 'English'}. Point out mispronounced words, comment on rhythm, stress, and intonation. Be encouraging but precise. Use Markdown.",
  "score": 8, // Score from 0 to 8 based on the criteria.
  "mispronouncedWords": ["word1", "word2"], // Array of words from the text that were missed or completely wrong.
  "inaccurateWords": ["word3", "word4"] // Array of words from the text that were pronounced inaccurately.
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { data: base64data, mimeType } },
              { text: "Please evaluate my reading of the text." }
            ]
          }
        ],
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              feedback: { type: Type.STRING },
              score: { type: Type.NUMBER },
              mispronouncedWords: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              inaccurateWords: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            },
            required: ["feedback", "score", "mispronouncedWords", "inaccurateWords"]
          }
        }
      });

      if (response.text) {
        const data = JSON.parse(response.text);
        setEvaluationResult(data.feedback);
        setEvaluationScore(data.score);
        setMispronouncedWords(data.mispronouncedWords || []);
        setInaccurateWords(data.inaccurateWords || []);
      }
    } catch (err) {
      console.error("Error evaluating audio:", err);
      setEvaluationResult(lang === 'zh' ? '评估失败，请重试。' : 'Evaluation failed, please try again.');
    } finally {
      setIsEvaluating(false);
    }
  };

  const generateStandardAudio = async () => {
    // If we already have a URL, don't generate again unless forced (handled by clearing state elsewhere)
    // But if the user clicks the button, we assume they want to generate.
    // However, the button is hidden if standardAudioUrl exists.
    
    setIsGeneratingAudio(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: selectedArticle.content }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Puck' },
            },
          },
        },
      });

      const part = response.candidates?.[0]?.content?.parts?.[0];
      const base64Audio = part?.inlineData?.data;
      // Use the mimeType from the response, default to audio/mpeg (MP3) if missing
      const mimeType = part?.inlineData?.mimeType || 'audio/mpeg';

      if (base64Audio) {
        const audioUrl = `data:${mimeType};base64,${base64Audio}`;
        setStandardAudioUrl(audioUrl);
      }
    } catch (err) {
      console.error("Error generating standard audio:", err);
      alert(lang === 'zh' ? '生成标准发音失败。' : 'Failed to generate standard audio.');
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="flex flex-col h-full text-zinc-100 rounded-2xl overflow-hidden border border-zinc-800/50 shadow-2xl liquid-panel">
      <div className="flex flex-col md:flex-row h-full">
        {/* Sidebar for Article Selection */}
        <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-zinc-800/50 flex flex-col shrink-0 md:max-h-none transition-all liquid-panel">
          <div 
            className="p-4 border-b border-zinc-800/50 flex justify-between items-center shrink-0 cursor-pointer md:cursor-default"
            onClick={() => setIsMaterialListOpen(!isMaterialListOpen)}
          >
            <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-white" />
              {lang === 'zh' ? '选择朗读素材' : 'Select Material'}
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); generateNewArticle(); }}
                disabled={isGenerating}
                className="p-1.5 bg-white/10 hover:bg-white/20 text-white rounded-md transition-colors disabled:opacity-50"
                title={lang === 'zh' ? 'AI生成新素材' : 'Generate new with AI'}
              >
                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              </button>
              <ChevronDown className={`w-4 h-4 text-zinc-400 md:hidden transition-transform ${isMaterialListOpen ? 'rotate-180' : ''}`} />
            </div>
          </div>
          <div className={`flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar max-h-48 md:max-h-none ${isMaterialListOpen ? 'block' : 'hidden md:block'}`}>
            {allArticles.map(article => (
              <button
                key={article.id}
                onClick={() => {
                  setSelectedArticleId(article.id);
                  setEvaluationResult(null);
                  setEvaluationScore(null);
                  setMispronouncedWords([]);
                  setInaccurateWords([]);
                  setAudioBlob(null);
                  setAudioUrl(null);
                  setStandardAudioUrl(null);
                }}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all ${
                  selectedArticleId === article.id
                    ? 'bg-white/10 text-white border border-white/20'
                    : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 opacity-70" />
                  <span className="truncate">{article.title}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Article Display */}
          <div className="flex-1 overflow-y-auto p-6 pb-32 custom-scrollbar">
            <div className="max-w-3xl mx-auto">
              <h1 className="text-2xl font-bold text-zinc-100 mb-6">{selectedArticle.title}</h1>
              <div className="prose prose-invert prose-zinc max-w-none">
                {selectedArticle.content.split('\n\n').map((paragraph, idx) => {
                  const words = paragraph.split(/(\b[\w']+\b)/);
                  return (
                    <p key={idx} className="text-lg leading-relaxed text-zinc-300 tracking-wide mb-4">
                      {words.map((word, wIdx) => {
                        // Only compare if it's a word (starts with a letter or number)
                        const isWordToken = /^[\w']/.test(word);
                        const cleanWord = word.toLowerCase();
                        
                        const isMispronounced = isWordToken && mispronouncedWords.some(mw => mw.toLowerCase() === cleanWord);
                        const isInaccurate = isWordToken && inaccurateWords.some(iw => iw.toLowerCase() === cleanWord);
                        
                        if (isMispronounced) {
                          return (
                            <span key={wIdx} className="bg-red-500/20 text-red-400 border-b border-red-500/50 px-0.5 rounded">
                              {word}
                            </span>
                          );
                        } else if (isInaccurate) {
                          return (
                            <span key={wIdx} className="bg-amber-500/20 text-amber-400 border-b border-amber-500/50 px-0.5 rounded">
                              {word}
                            </span>
                          );
                        } else {
                          return (
                            <span key={wIdx}>{word}</span>
                          );
                        }
                      })}
                    </p>
                  );
                })}
              </div>
              
              {selectedArticle.translation && (
                <div className="mt-8 pt-6 border-t border-zinc-800/50">
                  <h3 className="text-sm font-semibold text-zinc-400 mb-3">{lang === 'zh' ? '参考译文' : 'Translation'}</h3>
                  <p className="text-sm text-zinc-500 leading-relaxed">
                    {selectedArticle.translation}
                  </p>
                </div>
              )}

              {selectedArticle.keyWords && selectedArticle.keyWords.length > 0 && (
                <div className="mt-6 pt-6 border-t border-zinc-800/50">
                  <h3 className="text-sm font-semibold text-zinc-400 mb-3">{lang === 'zh' ? '重点词汇' : 'Key Words'}</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedArticle.keyWords.map((kw, idx) => (
                      <div key={idx} className="bg-zinc-800/50 border border-zinc-700/50 rounded-md px-3 py-1.5 flex items-center gap-2">
                        <span className="text-white font-medium text-sm">{kw.word}</span>
                        <span className="text-zinc-500 text-xs">{kw.meaning}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Bar */}
              <div className="mt-12 flex flex-col items-center pb-12">
                <div className="flex items-center gap-3 bg-zinc-900/90 backdrop-blur-md p-2 rounded-full border border-zinc-700/50 shadow-2xl liquid-panel-strong">
                  {!isRecording ? (
                    <button
                      onClick={startRecording}
                      className="flex items-center gap-2 bg-white hover:bg-zinc-200 text-black px-6 py-3 rounded-full font-medium transition-all shadow-[0_0_30px_rgba(255,255,255,0.4)] active:scale-95"
                    >
                      <Mic className="w-5 h-5" />
                      {lang === 'zh' ? '开始朗读' : 'Start Reading'}
                    </button>
                  ) : (
                    <button
                      onClick={stopRecording}
                      className="flex items-center gap-2 bg-red-500 hover:bg-red-400 text-white px-6 py-3 rounded-full font-medium transition-all shadow-lg shadow-red-500/20 animate-pulse liquid-button"
                    >
                      <Square className="w-5 h-5" />
                      {lang === 'zh' ? '停止录音' : 'Stop Recording'} ({formatTime(recordingTime)})
                    </button>
                  )}

                  {audioBlob && !isRecording && !evaluationResult && (
                    <button
                      onClick={evaluateAudio}
                      disabled={isEvaluating}
                      className={`flex items-center gap-2 px-6 py-3 rounded-full font-medium transition-all shadow-lg ${
                        isEvaluating
                          ? 'bg-zinc-700 text-zinc-300 cursor-wait'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20 liquid-button'
                      }`}
                    >
                      {isEvaluating ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          {lang === 'zh' ? '提交中...' : 'Submitting...'}
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-5 h-5" />
                          {lang === 'zh' ? '提交AI评估' : 'Submit to AI'}
                        </>
                      )}
                    </button>
                  )}
                </div>
                
                {isEvaluating && (
                  <div className="mt-4 text-zinc-400 text-sm animate-pulse flex items-center gap-2 bg-zinc-900/50 px-4 py-2 rounded-full border border-zinc-800">
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                    {lang === 'zh' ? 'AI正在认真听您的录音，请稍候...' : 'AI is listening to your recording...'}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Controls & Results */}
          {(audioUrl || evaluationResult) && (
            <div className="border-t border-zinc-800/50 bg-zinc-900/30 p-6 pb-32">
              <div className="max-w-3xl mx-auto flex flex-col gap-6">
                
                {/* Audio Players */}
              <div className="flex flex-col items-center gap-4">
                {audioUrl && !isRecording && (
                  <div className="flex flex-col gap-2 w-full max-w-md">
                    <div className="text-xs text-zinc-400 font-medium px-1">{lang === 'zh' ? '我的录音' : 'My Recording'}</div>
                    <div className="bg-zinc-900 p-3 rounded-xl border border-zinc-800">
                      <audio src={audioUrl} controls className="w-full h-10" />
                    </div>
                  </div>
                )}

                {/* Standard Audio Player */}
                {evaluationResult && (
                  <div className="flex flex-col gap-2 w-full max-w-md mt-2">
                    <div className="flex items-center justify-between px-1">
                      <div className="text-xs text-zinc-400 font-medium">{lang === 'zh' ? '标准发音' : 'Standard Pronunciation'}</div>
                      {!standardAudioUrl ? (
                        <button 
                          onClick={generateStandardAudio}
                          disabled={isGeneratingAudio}
                          className="text-xs text-white hover:text-zinc-300 flex items-center gap-1 disabled:opacity-50"
                        >
                          {isGeneratingAudio ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                          {lang === 'zh' ? '生成标准发音' : 'Generate Audio'}
                        </button>
                      ) : (
                        <button 
                          onClick={() => {
                            setStandardAudioUrl(null);
                            setTimeout(generateStandardAudio, 0);
                          }}
                          disabled={isGeneratingAudio}
                          className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1 disabled:opacity-50"
                          title={lang === 'zh' ? '重新生成' : 'Regenerate'}
                        >
                          <RefreshCw className={`w-3 h-3 ${isGeneratingAudio ? 'animate-spin' : ''}`} />
                        </button>
                      )}
                    </div>
                    {standardAudioUrl && (
                      <div className="bg-zinc-900 p-3 rounded-xl border border-zinc-800">
                        <audio 
                          src={standardAudioUrl} 
                          controls 
                          className="w-full h-10" 
                          onError={() => {
                            console.error("Audio playback error");
                            // Don't auto-reset to avoid infinite loops, but maybe show an error state?
                            // For now, let the user regenerate manually.
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Evaluation Result */}
              {evaluationResult && (
                <div className="bg-zinc-900/80 border border-zinc-700/50 rounded-xl p-6 shadow-xl backdrop-blur-sm animate-in fade-in slide-in-from-bottom-4 duration-500 relative overflow-hidden liquid-panel">
                  <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-emerald-500 to-teal-500"></div>
                  
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-emerald-400 flex items-center gap-2">
                      <CheckCircle className="w-5 h-5" />
                      {lang === 'zh' ? 'AI 评估报告' : 'AI Evaluation Report'}
                    </h3>
                    {evaluationScore !== null && (
                      <div className="flex items-center gap-2 bg-black/20 px-3 py-1.5 rounded-lg border border-zinc-800">
                        <span className="text-sm text-zinc-400">{lang === 'zh' ? '综合评分' : 'Score'}</span>
                        <span className={`text-xl font-bold ${evaluationScore >= 7 ? 'text-emerald-400' : evaluationScore >= 5 ? 'text-amber-400' : 'text-red-400'}`}>
                          {evaluationScore} <span className="text-sm font-normal text-zinc-500">/ 8</span>
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {mispronouncedWords.length > 0 && (
                    <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                      <div className="text-sm font-medium text-red-400 mb-2">
                        {lang === 'zh' ? '错读/漏读/回读：' : 'Missed/Wrong Words:'}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {mispronouncedWords.map((word, idx) => (
                          <span key={idx} className="text-xs bg-red-500/20 text-red-300 px-2 py-1 rounded">
                            {word}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {inaccurateWords.length > 0 && (
                    <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                      <div className="text-sm font-medium text-amber-400 mb-2">
                        {lang === 'zh' ? '发音不准：' : 'Inaccurate Pronunciation:'}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {inaccurateWords.map((word, idx) => (
                          <span key={idx} className="text-xs bg-amber-500/20 text-amber-300 px-2 py-1 rounded">
                            {word}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="prose prose-invert prose-emerald max-w-none text-sm">
                    <ReactMarkdown>{evaluationResult}</ReactMarkdown>
                  </div>
                </div>
              )}

            </div>
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
