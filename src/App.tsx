import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeKatex from 'rehype-katex';
import { Upload, Copy, Check, FileImage, Loader2, Trash2, AlertCircle, Camera, ArrowLeft, Info, BookOpen, ChevronRight, MessageCircle, Mic, Send, ChevronLeft, Maximize2, X, Book, FileText, Headphones, LineChart, Plus, Edit2, Palette, Globe, Keyboard, Image as ImageIcon, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { InlineMath } from 'react-katex';
import 'katex/dist/katex.min.css';

import { MODELS, TRANSLATIONS } from './constants';
import { AudioTutorView } from './components/AudioTutor';
import { TextbookManager, Textbook } from './components/TextbookManager';
import { ReadingCoach } from './components/ReadingCoach';
import GraphView from './components/GraphView';
import MathKeyboard from './components/MathKeyboard';
import { extractFunctionsFromImage, GraphScanMode } from './services/graphService';
import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import * as math from 'mathjs';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const formatContent = (content: string) => {
  if (!content) return '';
  // The model might return literal escape characters if JSON escaping fails.
  // We restore them to their LaTeX-safe backslashed versions.
  return content
    .replace(/\t/g, '\\t') // \text, \times, \tau
    .replace(/\r/g, '\\r') // \right, \rho
    .replace(/\n/g, '\\n') // \nu (if it was a literal newline, we'll fix it below)
    .replace(/\x08/g, '\\b') // \beta
    .replace(/\x0c/g, '\\f') // \frac
    .replace(/\x0b/g, '\\v') // \vec
    // Now handle the actual intended newlines
    .replace(/\\n/g, '\n')
    .replace(/\\\\n/g, '\n');
};

interface QuestionData {
  summary: string;
  question: string;
  answer: string;
  explanation: string;
  precautions: string;
}

function ChatBox({ data, model, setModel, lang, textbooks }: { data: QuestionData, model: string, setModel: (m: string) => void, lang: 'zh' | 'en', textbooks: Textbook[] }) {
  const [messages, setMessages] = useState<{role: 'user' | 'model', text: string}[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [selectedChatTextbookIds, setSelectedChatTextbookIds] = useState<string[]>([]);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const t = TRANSLATIONS[lang];

  useEffect(() => {
    setMessages([]);
    setInput('');
  }, [data.question]);

  useEffect(() => {
    if (textbooks.length > 0 && selectedChatTextbookIds.length === 0) {
      setSelectedChatTextbookIds(textbooks.map(b => b.id));
    }
  }, [textbooks]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages, loading]);

  const startRecording = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert(lang === 'zh' ? '您的浏览器不支持语音识别。' : 'Your browser does not support speech recognition.');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = lang === 'zh' ? 'zh-CN' : 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsRecording(true);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(prev => prev + transcript);
    };
    recognition.onerror = (event: any) => {
      console.error(event.error);
      setIsRecording(false);
    };
    recognition.onend = () => setIsRecording(false);
    recognition.start();
  };

  const handleSend = async (customText?: string) => {
    const messageToSend = customText || input.trim();
    if (!messageToSend) return;
    
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: messageToSend }]);
    setLoading(true);

    try {
      const history = messages.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      }));

      let textbookParts: any[] = [];
      let textbookInstruction = "";
      if (selectedChatTextbookIds && selectedChatTextbookIds.length > 0) {
        for (const id of selectedChatTextbookIds) {
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
        if (textbookParts.length > 0) {
          textbookInstruction = `\n\nCRITICAL: Textbook PDFs have been provided. You MUST use these textbooks to answer the user's question. When you use information from the textbooks, you MUST explicitly state the page number where the information is found (e.g., "According to page 45 of the textbook...").`;
        }
      }

      const systemInstruction = `You are a helpful AI tutor. The user is asking about the following question:\n\nQuestion:\n${data.question}\n\nExplanation:\n${data.explanation}\n\nPrecautions:\n${data.precautions}\n\nAnswer the user's questions based on this context in ${lang === 'zh' ? 'Chinese' : 'English'}. ${textbookInstruction}

CRITICAL INSTRUCTIONS:
- You ONLY have access to the Question, Explanation, and Precautions text provided above, PLUS the textbook PDFs if provided.
- Use STRICT LaTeX for ALL math symbols, chemical formulas (e.g., $Cl_2$, $H_2O$, $Na^+$, $SO_4^{2-}$), units (e.g., $mol/L$, $g/cm^3$), and formatting.
- **Wrap EVERY single math/formula/unit/equation in $ for inline or $$ for block math. This is MANDATORY for chemical equations like $2NO_2 \rightleftharpoons N_2O_4$.**
- Example: Use $Cl_2$ instead of Cl2, use $1 \text{ mol}$ instead of 1mol, use $2H_2 + O_2 \rightarrow 2H_2O$ for equations.
- **For multiple-choice questions, ensure each option (A, B, C, D) starts on a NEW line.**
- Be concise and professional.
- Ensure all backslashes in LaTeX are properly escaped if you are returning JSON (though here you are returning raw text, still be careful with escape characters).`;

      const contents: any[] = [...history];
      
      const userParts: any[] = [];
      if (textbookParts.length > 0) {
        userParts.push(...textbookParts);
      }
      userParts.push({ text: messageToSend });
      
      contents.push({ role: 'user', parts: userParts });

      const response = await ai.models.generateContent({
        model: model,
        contents: contents,
        config: {
          systemInstruction,
          thinkingConfig: {
            thinkingLevel: model.includes('flash') ? ThinkingLevel.LOW : ThinkingLevel.HIGH
          }
        }
      });

      setMessages(prev => [...prev, { role: 'model', text: response.text || '' }]);
    } catch (err: any) {
      console.error(err);
      const errorMsg = lang === 'zh' ? `错误: ${err.message}` : `Error: ${err.message}`;
      setMessages(prev => [...prev, { role: 'model', text: errorMsg }]);
    } finally {
      setLoading(false);
    }
  };

  const quickActions = [
    { label: t.summaryAction, icon: '📝' },
    { label: t.exampleAction, icon: '💡' },
    { label: t.pitfallAction, icon: '⚠️' },
  ];

  const ChatContent = (
    <div className={`flex flex-col ${isFullScreen ? 'h-full' : ''}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-white/10 rounded-lg ring-1 ring-white/20">
            <MessageCircle className="w-4 h-4 text-white" />
          </div>
          <h4 className="font-semibold text-sm text-white tracking-tight">{t.aiChat}</h4>
        </div>
        <div className="flex items-center gap-2">
          {textbooks.length > 0 && (
            <div className="relative group/dropdown">
              <button className="bg-black/40 hover:bg-white/5 border border-white/10 text-zinc-300 text-[10px] rounded-full px-3 py-1.5 outline-none focus:ring-1 focus:ring-white cursor-pointer backdrop-blur-md max-w-[140px] truncate flex items-center gap-1.5 transition-all">
                <Book className="w-3 h-3" />
                {selectedChatTextbookIds.length === 0 
                  ? (lang === 'zh' ? '不关联教材' : 'No textbook') 
                  : (lang === 'zh' ? `已关联 ${selectedChatTextbookIds.length} 本教材` : `${selectedChatTextbookIds.length} textbooks`)}
              </button>
              <div className="absolute right-0 top-full mt-1 w-48 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl opacity-0 invisible group-hover/dropdown:opacity-100 group-hover/dropdown:visible transition-all z-50 p-2 flex flex-col gap-1 max-h-48 overflow-y-auto custom-scrollbar">
                {textbooks.map(book => {
                  const isSelected = selectedChatTextbookIds.includes(book.id);
                  return (
                    <button
                      key={book.id}
                      onClick={() => {
                        if (isSelected) {
                          setSelectedChatTextbookIds(prev => prev.filter(id => id !== book.id));
                        } else {
                          setSelectedChatTextbookIds(prev => [...prev, book.id]);
                        }
                      }}
                      className={`text-left px-2 py-1.5 text-xs rounded-md transition-colors ${
                        isSelected ? 'bg-white text-black shadow-[0_0_10px_rgba(255,255,255,0.3)]' : 'text-zinc-400 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <div className="truncate">{book.name}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <select 
            value={model || ''} 
            onChange={e => setModel(e.target.value)}
            className="bg-black/40 hover:bg-white/5 border border-white/10 text-zinc-300 text-[10px] rounded-full px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-white cursor-pointer backdrop-blur-md appearance-none text-center min-w-[80px]"
          >
            {MODELS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <button 
            onClick={() => setIsFullScreen(!isFullScreen)}
            className="p-1.5 bg-white/5 border border-white/10 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-all active:scale-95"
            title={isFullScreen ? (lang === 'zh' ? '退出全屏' : 'Exit Full Screen') : (lang === 'zh' ? '全屏查看' : 'Full Screen')}
          >
            {isFullScreen ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>
      
      <div ref={chatContainerRef} className={`space-y-3 overflow-y-auto mb-3 pr-2 custom-scrollbar text-xs ${isFullScreen ? 'flex-1' : 'max-h-72'}`}>
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-6 space-y-4">
            <p className="text-zinc-500 text-xs">{t.askMe}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {quickActions.map((action) => (
                <button
                  key={action.label}
                  onClick={() => handleSend(action.label)}
                  className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-zinc-300 text-[10px] transition-all active:scale-95 flex items-center gap-1.5"
                >
                  <span>{action.icon}</span>
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[90%] rounded-2xl px-3 py-2 ${msg.role === 'user' ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-200'}`}>
              <div className="prose prose-invert prose-xs max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]} rehypePlugins={[rehypeKatex]}>
                  {formatContent(msg.text)}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl p-4 bg-zinc-800 text-zinc-400 flex items-center gap-2 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> {t.thinking}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-end gap-2">
        <textarea
          value={input || ''}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder={t.placeholder}
          className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-sm text-zinc-200 focus:outline-none focus:border-white/50 resize-none min-h-[40px] max-h-32"
          rows={1}
        />
        <button
          onClick={startRecording}
          className={`p-3 rounded-xl border transition-colors ${isRecording ? 'bg-red-500/20 border-red-500 text-red-500 animate-pulse' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
          title={lang === 'zh' ? '语音输入' : 'Voice Input'}
        >
          <Mic className="w-5 h-5" />
        </button>
        <button
          onClick={() => handleSend()}
          disabled={loading || !input.trim()}
          className="p-3 rounded-xl bg-white text-black disabled:opacity-50 hover:bg-zinc-200 transition-colors shadow-[0_0_20px_rgba(255,255,255,0.4)] active:scale-95"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div className="rounded-2xl border border-white/10 p-4 md:p-5 backdrop-blur-3xl mt-4 shadow-[0_0_30px_rgba(0,0,0,0.5)] ring-1 ring-white/5 liquid-panel">
        {ChatContent}
      </div>

      <AnimatePresence>
        {isFullScreen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-3xl p-4 md:p-8 flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-4xl h-full max-h-[90vh] border border-white/10 rounded-3xl p-6 overflow-hidden flex flex-col shadow-2xl ring-1 ring-white/10 liquid-panel-strong"
            >
              {ChatContent}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function QuestionDetail({ 
  data, onBack, onNext, onPrev, hasNext, hasPrev, model, setModel, lang, textbooks 
}: { 
  data: QuestionData; onBack: () => void; onNext: () => void; onPrev: () => void; hasNext: boolean; hasPrev: boolean; model: string; setModel: (m: string) => void; lang: 'zh' | 'en'; textbooks: Textbook[];
}) {
  const [copied, setCopied] = useState(false);
  const [touchStart, setTouchStart] = useState<{x: number, y: number} | null>(null);
  const [touchEnd, setTouchEnd] = useState<{x: number, y: number} | null>(null);
  const [fullScreenPanel, setFullScreenPanel] = useState<'question' | 'explanation' | 'precautions' | 'answer' | null>(null);
  const t = TRANSLATIONS[lang];

  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart({ x: e.targetTouches[0].clientX, y: e.targetTouches[0].clientY });
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd({ x: e.targetTouches[0].clientX, y: e.targetTouches[0].clientY });
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distanceX = touchStart.x - touchEnd.x;
    const distanceY = touchStart.y - touchEnd.y;
    
    if (Math.abs(distanceX) > Math.abs(distanceY) && Math.abs(distanceX) > minSwipeDistance) {
      if (distanceX > 0 && hasNext) {
        onNext();
      } else if (distanceX < 0 && hasPrev) {
        onPrev();
      }
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(data.question);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const PanelHeader = ({ title, icon: Icon, type, showCopy }: { title: string, icon: any, type: 'question' | 'explanation' | 'precautions' | 'answer', showCopy?: boolean }) => (
    <div className="flex items-center justify-between px-5 py-2.5 border-b border-white/5 bg-white/5">
      <div className="flex items-center gap-2">
        <div className={`p-1.5 rounded-lg ring-1 ${
          type === 'question' ? 'bg-white/10 ring-white/20' : 
          type === 'answer' ? 'bg-rose-500/20 ring-rose-500/30' :
          type === 'explanation' ? 'bg-emerald-500/20 ring-emerald-500/30' : 
          'bg-amber-500/20 ring-amber-500/30'
        }`}>
          <Icon className={`w-4 h-4 ${
            type === 'question' ? 'text-white' : 
            type === 'answer' ? 'text-rose-400' :
            type === 'explanation' ? 'text-emerald-400' : 
            'text-amber-400'
          }`} />
        </div>
        <h3 className="font-semibold text-xs text-white tracking-tight">{title}</h3>
      </div>
      <div className="flex items-center gap-2">
        {showCopy && (
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-zinc-900 bg-white rounded-full hover:bg-zinc-200 transition-all active:scale-95 shadow-[0_0_15px_rgba(255,255,255,0.2)]"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
            {copied ? t.copied : t.copy}
          </button>
        )}
        <button 
          onClick={() => setFullScreenPanel(fullScreenPanel === type ? null : type)}
          className="p-1.5 bg-white/5 border border-white/10 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-all active:scale-95"
          title={fullScreenPanel === type ? (lang === 'zh' ? '退出全屏' : 'Exit Full Screen') : (lang === 'zh' ? '全屏查看' : 'Full Screen')}
        >
          {fullScreenPanel === type ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );

  const QuestionContent = (isFull: boolean) => (
    <div className={`p-3 md:p-4 prose prose-invert prose-zinc prose-sm max-w-none overflow-x-auto bg-zinc-900/30 ${isFull ? 'flex-1 overflow-y-auto' : ''}`}>
      <div className="markdown-body">
        <ReactMarkdown 
          remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]} 
          rehypePlugins={[rehypeKatex]}
          components={{
            img: ({node, src, ...props}) => {
              if (!src) return null;
              return <img src={src} {...props} className="rounded-lg border border-white/10 shadow-lg" />;
            }
          }}
        >
          {formatContent(data.question)}
        </ReactMarkdown>
      </div>
    </div>
  );

  const ExplanationContent = (isFull: boolean) => (
    <div className={`prose prose-invert prose-zinc prose-xs max-w-none text-zinc-300 leading-relaxed overflow-y-auto pr-2 custom-scrollbar ${isFull ? 'flex-1' : 'max-h-64'}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]} rehypePlugins={[rehypeKatex]}>
        {formatContent(data.explanation)}
      </ReactMarkdown>
    </div>
  );

  const PrecautionsContent = (isFull: boolean) => (
    <div className={`prose prose-invert prose-zinc prose-xs max-w-none text-zinc-300 leading-relaxed overflow-y-auto pr-2 custom-scrollbar ${isFull ? 'flex-1' : 'max-h-64'}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]} rehypePlugins={[rehypeKatex]}>
        {formatContent(data.precautions)}
      </ReactMarkdown>
    </div>
  );

  return (
    <motion.div
      key={data.question}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-4"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          {t.back}
        </button>
        <div className="flex items-center gap-2">
          <button onClick={onPrev} disabled={!hasPrev} className="p-2 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 disabled:opacity-30 hover:text-white hover:bg-zinc-800 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={onNext} disabled={!hasNext} className="p-2 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 disabled:opacity-30 hover:text-white hover:bg-zinc-800 transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.6)] backdrop-blur-3xl ring-1 ring-white/5 liquid-panel">
        <PanelHeader title={t.questionContent} icon={BookOpen} type="question" showCopy />
        {QuestionContent(false)}
      </div>

      <div className="rounded-2xl border border-white/10 overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.6)] backdrop-blur-3xl ring-1 ring-white/5 liquid-panel">
        <PanelHeader title={t.answer} icon={Check} type="answer" />
        <div className="p-4 text-zinc-200 font-medium text-lg">
          {data.answer}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/10 p-4 md:p-5 backdrop-blur-3xl ring-1 ring-white/5 liquid-panel">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-emerald-500/20 rounded-lg ring-1 ring-emerald-500/30">
                <Info className="w-4 h-4 text-emerald-400" />
              </div>
              <h4 className="font-semibold text-xs text-white tracking-tight">{t.explanation}</h4>
            </div>
            <button 
              onClick={() => setFullScreenPanel('explanation')}
              className="p-1.5 bg-white/5 border border-white/10 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-all active:scale-95"
              title={lang === 'zh' ? '全屏查看' : 'Full Screen'}
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
          {ExplanationContent(false)}
        </div>

        <div className="rounded-2xl border border-white/10 p-4 md:p-5 backdrop-blur-3xl ring-1 ring-white/5 liquid-panel">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-amber-500/20 rounded-lg ring-1 ring-amber-500/30">
                <AlertCircle className="w-4 h-4 text-amber-400" />
              </div>
              <h4 className="font-semibold text-xs text-white tracking-tight">{t.precautions}</h4>
            </div>
            <button 
              onClick={() => setFullScreenPanel('precautions')}
              className="p-1.5 bg-white/5 border border-white/10 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-all active:scale-95"
              title={lang === 'zh' ? '全屏查看' : 'Full Screen'}
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
          {PrecautionsContent(false)}
        </div>
      </div>
      
      <ChatBox data={data} model={model} setModel={setModel} lang={lang} textbooks={textbooks} />

      <AnimatePresence>
        {fullScreenPanel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-3xl p-4 md:p-8 flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-4xl h-full max-h-[90vh] border border-white/10 rounded-3xl overflow-hidden flex flex-col shadow-2xl ring-1 ring-white/10 liquid-panel-strong"
            >
              {fullScreenPanel === 'question' && (
                <>
                  <PanelHeader title={t.questionContent} icon={BookOpen} type="question" showCopy />
                  {QuestionContent(true)}
                </>
              )}
              {fullScreenPanel === 'answer' && (
                <div className="p-6 flex flex-col h-full">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-rose-500/20 rounded-lg ring-1 ring-rose-500/30">
                        <Check className="w-4 h-4 text-rose-400" />
                      </div>
                      <h4 className="font-semibold text-sm text-white tracking-tight">{t.answer}</h4>
                    </div>
                    <button 
                      onClick={() => setFullScreenPanel(null)}
                      className="p-1.5 bg-white/10 border border-white/20 rounded-lg text-zinc-400 hover:text-white hover:bg-white/20 transition-all active:scale-95"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="p-4 text-zinc-200 font-medium text-lg flex-1 overflow-y-auto">
                    {data.answer}
                  </div>
                </div>
              )}
              {fullScreenPanel === 'explanation' && (
                <div className="p-6 flex flex-col h-full">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-emerald-500/20 rounded-lg ring-1 ring-emerald-500/30">
                        <Info className="w-4 h-4 text-emerald-400" />
                      </div>
                      <h4 className="font-semibold text-sm text-white tracking-tight">{t.explanation}</h4>
                    </div>
                    <button 
                      onClick={() => setFullScreenPanel(null)}
                      className="p-1.5 bg-white/10 border border-white/20 rounded-lg text-zinc-400 hover:text-white hover:bg-white/20 transition-all active:scale-95"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  {ExplanationContent(true)}
                </div>
              )}
              {fullScreenPanel === 'precautions' && (
                <div className="p-6 flex flex-col h-full">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-amber-500/20 rounded-lg ring-1 ring-amber-500/30">
                        <AlertCircle className="w-4 h-4 text-amber-400" />
                      </div>
                      <h4 className="font-semibold text-sm text-white tracking-tight">{t.precautions}</h4>
                    </div>
                    <button 
                      onClick={() => setFullScreenPanel(null)}
                      className="p-1.5 bg-white/10 border border-white/20 rounded-lg text-zinc-400 hover:text-white hover:bg-white/20 transition-all active:scale-95"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  {PrecautionsContent(true)}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function QuestionListItem({ data, index, onClick, lang }: { data: QuestionData; index: number; onClick: () => void; lang: 'zh' | 'en' }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      onClick={onClick}
      className="group hover:bg-white/5 border border-white/10 hover:border-white/20 p-3.5 rounded-xl cursor-pointer transition-all duration-300 flex items-center justify-between shadow-lg backdrop-blur-2xl liquid-panel"
    >
      <div className="flex items-center gap-3 overflow-hidden">
        <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-zinc-400 text-sm font-bold group-hover:bg-white group-hover:text-black transition-colors shrink-0">
          {index + 1}
        </div>
        <div className="overflow-hidden">
          <h4 className="text-zinc-200 text-sm font-medium truncate group-hover:text-white transition-colors">
            {data.question.replace(/[$#*`]/g, '').slice(0, 40)}...
          </h4>
          <p className="text-zinc-500 text-[8px] mt-0.5 truncate uppercase tracking-wider">
            {lang === 'zh' ? '点击查看详细讲解与注意事项' : 'Click to view detailed explanation and notes'}
          </p>
        </div>
      </div>
      <ChevronRight className="w-5 h-5 text-zinc-700 group-hover:text-white group-hover:translate-x-1 transition-all shrink-0" />
    </motion.div>
  );
}

function BackgroundLines() {
  const verticalLines = [
    { left: '15%', duration: 7, delay: 0 },
    { left: '35%', duration: 9, delay: 2 },
    { left: '55%', duration: 6, delay: 1 },
    { left: '75%', duration: 8, delay: 3 },
    { left: '95%', duration: 10, delay: 0.5 },
  ];

  const horizontalLines = [
    { top: '15%', duration: 8, delay: 1 },
    { top: '45%', duration: 10, delay: 3 },
    { top: '75%', duration: 7, delay: 0 },
  ];

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {verticalLines.map((line, i) => (
        <motion.div
          key={`v-${i}`}
          className="absolute w-[1px] h-[30vh] bg-gradient-to-b from-transparent via-white to-transparent shadow-[0_0_20px_rgba(255,255,255,0.5)]"
          style={{ left: line.left, top: '-30vh' }}
          animate={{ top: '130vh' }}
          transition={{ duration: line.duration, repeat: Infinity, ease: "linear", delay: line.delay }}
        />
      ))}
      {horizontalLines.map((line, i) => (
        <motion.div
          key={`h-${i}`}
          className="absolute h-[1px] w-[30vw] bg-gradient-to-r from-transparent via-white to-transparent shadow-[0_0_20px_rgba(255,255,255,0.5)]"
          style={{ top: line.top, left: '-30vw' }}
          animate={{ left: '130vw' }}
          transition={{ duration: line.duration, repeat: Infinity, ease: "linear", delay: line.delay }}
        />
      ))}
    </div>
  );
}

export default function App() {
  const [appMode, setAppMode] = useState<'extractor' | 'audio-tutor' | 'reading-coach' | 'grapher'>('extractor');
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gemini-3-pro-preview');
  const [language, setLanguage] = useState<'zh' | 'en'>('zh');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  
  const [showTextbookManager, setShowTextbookManager] = useState(false);
  const [textbooks, setTextbooks] = useState<Textbook[]>([]);
  const [selectedTextbookIds, setSelectedTextbookIds] = useState<string[]>([]);
  const [associateTextbook, setAssociateTextbook] = useState(false);

  // Grapher State
  const [graphFunctions, setGraphFunctions] = useState<{id: string, expression: string, visible: boolean, color: string}[]>([]);
  const [graphParameters, setGraphParameters] = useState<Record<string, any>>({});
  const [graphInputValue, setGraphInputValue] = useState('');
  const [graphEditingId, setGraphEditingId] = useState<string | null>(null);
  const [graphActiveTab, setGraphActiveTab] = useState<'manual' | 'photo'>('manual');
  const [graphScanMode, setGraphScanMode] = useState<GraphScanMode>('gemini-3-flash-low');
  const [graphIsScanning, setGraphIsScanning] = useState(false);
  const [graphScannedResults, setGraphScannedResults] = useState<string[]>([]);
  const [graphLastImageData, setGraphLastImageData] = useState<{ base64: string, mimeType: string } | null>(null);
  const [graphSelectedIndices, setGraphSelectedIndices] = useState<Set<number>>(new Set());
  const [graphShowColorPicker, setGraphShowColorPicker] = useState<string | null>(null);
  const graphInputRef = useRef<HTMLInputElement>(null);
  const graphFileInputRef = useRef<HTMLInputElement>(null);

  const COLORS = [
    '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#ef4444', 
    '#3b82f6', '#8b5cf6', '#06b6d4', '#f97316', '#14b8a6',
    '#ffffff'
  ];

  const splitImplicitMultiplication = (expr: string) => {
    const functions = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'log', 'ln', 'sqrt', 'abs', 'exp', 'pi', 'phi'];
    let processed = expr;
    const placeholders: string[] = [];
    
    // Sort functions by length descending to avoid partial matches
    const sortedFns = [...functions].sort((a, b) => b.length - a.length);
    
    sortedFns.forEach((fn, i) => {
      const placeholder = `__FN${i}__`;
      processed = processed.replace(new RegExp(fn, 'gi'), placeholder);
      placeholders[i] = fn;
    });
    
    // Split adjacent letters: kx -> k x
    processed = processed.replace(/([a-z])([a-z])/gi, '$1 $2');
    processed = processed.replace(/([a-z])([a-z])/gi, '$1 $2'); // Double pass for cases like kxy
    
    // Restore functions
    sortedFns.forEach((fn, i) => {
      processed = processed.replace(new RegExp(`__FN${i}__`, 'g'), fn);
    });
    
    return processed;
  };

  const t = TRANSLATIONS[language];

  // Grapher Helpers
  const addGraphFunction = (expr: string) => {
    if (!expr.trim()) return;
    const processedExpr = splitImplicitMultiplication(expr);
    detectGraphParameters(processedExpr);
    if (graphEditingId) {
      setGraphFunctions(prev => prev.map(f => f.id === graphEditingId ? { ...f, expression: expr } : f));
      setGraphEditingId(null);
    } else {
      setGraphFunctions(prev => {
        const newFunc = {
          id: Math.random().toString(36).substr(2, 9),
          expression: expr,
          visible: true,
          color: COLORS[prev.length % COLORS.length]
        };
        return [...prev, newFunc];
      });
    }
    setGraphInputValue('');
  };

  const detectGraphParameters = (expr: string) => {
    try {
      const processed = splitImplicitMultiplication(expr);
      const node = math.parse(processed.replace(/f\(x\)\s*=/g, '').replace(/y\s*=/g, ''));
      const variables = new Set<string>();
      node.traverse((n: any) => {
        if (n.type === 'SymbolNode' && !['x', 'y', 'e', 'pi', 'PI', 'phi', 'i'].includes(n.name)) {
          try {
            if (typeof (math as any)[n.name] !== 'function') {
              variables.add(n.name);
            }
          } catch {
            variables.add(n.name);
          }
        }
      });
      
      setGraphParameters(prev => {
        const newParams = { ...prev };
        let changed = false;
        variables.forEach(v => {
          if (!newParams[v]) {
            newParams[v] = { name: v, value: 1, min: -10, max: 10, step: 0.1 };
            changed = true;
          }
        });
        return changed ? newParams : prev;
      });
    } catch (e) {}
  };

  const insertAtGraphCursor = (text: string) => {
    const input = graphInputRef.current;
    if (!input) return;
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    let newValue = '';
    let newCursorPos = start + text.length;
    if (text === 'frac') {
      const template = '()/()';
      newValue = graphInputValue.substring(0, start) + template + graphInputValue.substring(end);
      newCursorPos = start + 1;
    } else if (['sqrt(', 'abs(', 'log(', 'sin(', 'cos(', 'tan('].includes(text)) {
      const template = text + ')';
      newValue = graphInputValue.substring(0, start) + template + graphInputValue.substring(end);
      newCursorPos = start + text.length;
    } else {
      newValue = graphInputValue.substring(0, start) + text + graphInputValue.substring(end);
      newCursorPos = start + text.length;
    }
    setGraphInputValue(newValue);
    setTimeout(() => {
      input.selectionStart = input.selectionEnd = newCursorPos;
      input.focus();
    }, 0);
  };

  const deleteAtGraphCursor = () => {
    const input = graphInputRef.current;
    if (!input) return;
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    if (start === end && start > 0) {
      const newValue = graphInputValue.substring(0, start - 1) + graphInputValue.substring(end);
      setGraphInputValue(newValue);
      setTimeout(() => { input.selectionStart = input.selectionEnd = start - 1; input.focus(); }, 0);
    } else if (start !== end) {
      const newValue = graphInputValue.substring(0, start) + graphInputValue.substring(end);
      setGraphInputValue(newValue);
      setTimeout(() => { input.selectionStart = input.selectionEnd = start; input.focus(); }, 0);
    }
  };

  const moveGraphCursor = (dir: 'left' | 'right') => {
    const input = graphInputRef.current;
    if (!input) return;
    const start = input.selectionStart || 0;
    if (dir === 'left' && start > 0) input.selectionStart = input.selectionEnd = start - 1;
    else if (dir === 'right' && start < graphInputValue.length) input.selectionStart = input.selectionEnd = start + 1;
    input.focus();
  };

  const toGraphLatex = (expr: string) => {
    try {
      let cleanExpr = expr.trim();
      if (!cleanExpr) return '';
      const parts = cleanExpr.split('=');
      let left = 'y';
      let right = cleanExpr;
      if (parts.length > 1) { left = parts[0].trim(); right = parts[1].trim(); }
      let processedRight = right.replace(/log2\(([^)]+)\)/g, 'log($1, 2)').replace(/log10\(([^)]+)\)/g, 'log($1, 10)');
      const node = math.parse(processedRight);
      let tex = node.toTex({ parenthesis: 'keep', implicit: 'hide' });
      return parts.length > 1 ? `${left} = ${tex}` : tex;
    } catch (e) {
      return expr.replace(/\//g, '\\div ').replace(/\*/g, '\\cdot ').replace(/sqrt\(([^)]+)\)/g, '\\sqrt{$1}').replace(/\(([^)]+)\)\/\(([^)]+)\)/g, '\\frac{$1}{$2}');
    }
  };

  const handleGraphFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setGraphIsScanning(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = (reader.result as string).split(',')[1];
      setGraphLastImageData({ base64, mimeType: file.type });
      const results = await extractFunctionsFromImage(base64, file.type, graphScanMode);
      setGraphScannedResults(results);
      setGraphSelectedIndices(new Set(results.map((_, i) => i)));
      setGraphIsScanning(false);
    };
    reader.readAsDataURL(file);
  };

  const regenerateGraphFunctions = async () => {
    if (!graphLastImageData) return;
    setGraphIsScanning(true);
    const results = await extractFunctionsFromImage(
      graphLastImageData.base64, 
      graphLastImageData.mimeType, 
      graphScanMode
    );
    setGraphScannedResults(results);
    setGraphSelectedIndices(new Set(results.map((_, i) => i)));
    setGraphIsScanning(false);
  };

  useEffect(() => {
    loadTextbooks();
  }, [showTextbookManager]);

  const loadTextbooks = async () => {
    try {
      if (!db) throw new Error('Firebase not configured');
      const querySnapshot = await getDocs(collection(db, 'textbooks'));
      const books: Textbook[] = [];
      querySnapshot.forEach((doc) => {
        books.push({ id: doc.id, ...doc.data() } as Textbook);
      });
      const sortedBooks = books.sort((a, b) => {
        const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : (a.createdAt || 0));
        const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : (b.createdAt || 0));
        return bTime - aTime;
      });
      setTextbooks(sortedBooks);
      
      // Select all by default if nothing is selected
      if (selectedTextbookIds.length === 0 && sortedBooks.length > 0) {
        setSelectedTextbookIds(sortedBooks.map(b => b.id));
      }
    } catch (err) {
      console.warn("Firebase error in App.tsx, falling back to localStorage:", err);
      const localBooks = localStorage.getItem('textbooks');
      if (localBooks) {
        try {
          const parsed = JSON.parse(localBooks);
          const sortedBooks = parsed.sort((a: any, b: any) => (b.createdAt?.seconds || b.createdAt || 0) - (a.createdAt?.seconds || a.createdAt || 0));
          setTextbooks(sortedBooks);
          if (selectedTextbookIds.length === 0 && sortedBooks.length > 0) {
            setSelectedTextbookIds(sortedBooks.map((b: any) => b.id));
          }
        } catch (e) {
          setTextbooks([]);
        }
      } else {
        setTextbooks([]);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(e.target.files);
      e.target.value = ''; // Clear the input value
    }
  };

  const processFiles = (selectedFiles: FileList | File[]) => {
    const newFiles = Array.from(selectedFiles).filter(f => f.type.startsWith('image/'));
    if (newFiles.length === 0) return;
    setFiles(prev => [...prev, ...newFiles]);
    const newUrls = newFiles.map(f => URL.createObjectURL(f));
    setPreviewUrls(prev => [...prev, ...newUrls]);
    setQuestions([]);
    setSelectedIdx(null);
    setError(null);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setPreviewUrls(prev => {
      const newUrls = [...prev];
      URL.revokeObjectURL(newUrls[index]);
      newUrls.splice(index, 1);
      return newUrls;
    });
  };

  const clearFiles = () => {
    setFiles([]);
    setGraphLastImageData(null);
    previewUrls.forEach(url => URL.revokeObjectURL(url));
    setPreviewUrls([]);
    setQuestions([]);
    setSelectedIdx(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const extractQuestions = async () => {
    if (files.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const imageParts = await Promise.all(files.map(async (f) => {
        const base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(f);
        });
        return { inlineData: { data: base64Data, mimeType: f.type } };
      }));

      const parts: any[] = [...imageParts];

      parts.push({
        text: `Analyze the provided image and extract all questions. For each question, provide:
1. summary: A short summary.
2. question: The full question text (题干). Use standard Markdown table syntax for tables.
3. answer: The answer to the question (e.g., "A", "B", "C", "D" or the specific value).
4. explanation: A detailed explanation and solution (讲解).
5. precautions: Important notes, common pitfalls, or tips (注意事项).

CRITICAL INSTRUCTIONS:
- OUTPUT LANGUAGE: ${language === 'zh' ? 'Chinese' : 'English'}.
- Use STRICT LaTeX for ALL math symbols, chemical formulas (e.g., $Cl_2$, $H_2O$, $Na^+$, $SO_4^{2-}$), units (e.g., $mol/L$, $g/cm^3$), and formatting.
- **Wrap EVERY single math/formula/unit/equation in $ for inline or $$ for block math. This is MANDATORY for chemical equations like $2NO_2 \rightleftharpoons N_2O_4$.**
- Example: Use $Cl_2$ instead of Cl2, use $1 \text{ mol}$ instead of 1mol, use $2H_2 + O_2 \rightarrow 2H_2O$ for equations.
- Preserve the original layout in the "question" field. **For multiple-choice questions, ensure each option (A, B, C, D) starts on a NEW line. This is CRITICAL.**
- Return the result as a JSON array of objects.
- Ensure all backslashes in LaTeX are properly escaped in the JSON string (e.g., "\\\\text" for \text).`,
      });

      const response = await ai.models.generateContent({
        model: selectedModel,
        contents: {
          parts: parts,
        },
        config: {
          responseMimeType: 'application/json',
          thinkingConfig: {
            thinkingLevel: selectedModel.includes('flash') ? ThinkingLevel.LOW : ThinkingLevel.HIGH
          },
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                summary: { type: Type.STRING },
                question: { type: Type.STRING },
                answer: { type: Type.STRING },
                explanation: { type: Type.STRING },
                precautions: { type: Type.STRING },
              },
              required: ['summary', 'question', 'answer', 'explanation', 'precautions'],
            },
          },
        },
      });

      const text = response.text;
      if (text) {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setQuestions(parsed);
        } else {
          setError(language === 'zh' ? '未识别到题目或返回格式错误。' : 'No questions identified or invalid format returned.');
        }
      }
    } catch (err: any) {
      const errorMsg = language === 'zh' ? (err.message || '提取题目时发生错误。') : (err.message || 'Error extracting questions.');
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`min-h-screen bg-black text-zinc-100 font-sans selection:bg-zinc-800 selection:text-white relative flex flex-col`}>
      <BackgroundLines />
      <div className={`max-w-4xl mx-auto px-4 py-4 md:py-8 relative z-10 flex-1 flex flex-col w-full`}>
        <header className="mb-4 text-center p-3 rounded-2xl border border-white/10 backdrop-blur-2xl shadow-2xl relative shrink-0 liquid-panel">
          <div className="absolute top-3 right-3">
            <button
              onClick={() => setLanguage(prev => prev === 'zh' ? 'en' : 'zh')}
              className="px-2 py-1 bg-white/10 hover:bg-white/20 border border-white/10 rounded-md text-[10px] font-bold text-zinc-300 transition-all flex items-center gap-1"
            >
              <span className="text-white">🌐</span>
              {language === 'zh' ? 'EN' : '中文'}
            </button>
          </div>
          <motion.h1 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-2xl md:text-4xl font-bold tracking-tight text-white mb-1"
          >
            {t.title} <span className="text-white">Pro</span>
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-zinc-400 max-w-xl mx-auto text-[10px] md:text-sm leading-relaxed"
          >
            {t.subtitle}
          </motion.p>
        </header>

        <main className={`space-y-6 flex-1 flex flex-col`}>
          <div className="flex justify-center mb-8 shrink-0">
            <div className="flex gap-4 md:gap-8 p-4 rounded-3xl border border-white/5 backdrop-blur-3xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] bg-black/20 liquid-panel">
              <button
                onClick={() => setAppMode('extractor')}
                className="group flex flex-col items-center gap-3 transition-all duration-300 active:scale-95 relative"
              >
                <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-500 border border-white/10 ${
                  appMode === 'extractor'
                    ? 'bg-white text-black shadow-[0_0_50px_rgba(255,255,255,0.7)] scale-105 z-10'
                    : 'bg-black/40 text-white hover:bg-black/60 z-0'
                }`}>
                  <FileText className="w-7 h-7" />
                </div>
                <span className={`text-xs font-medium transition-colors ${appMode === 'extractor' ? 'text-white' : 'text-zinc-400'}`}>
                  {t.extractorMode}
                </span>
              </button>
              
              <button
                onClick={() => setAppMode('audio-tutor')}
                className="group flex flex-col items-center gap-3 transition-all duration-300 active:scale-95 relative"
              >
                <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-500 border border-white/10 ${
                  appMode === 'audio-tutor'
                    ? 'bg-white text-black shadow-[0_0_50px_rgba(255,255,255,0.7)] scale-105 z-10'
                    : 'bg-black/40 text-white hover:bg-black/60 z-0'
                }`}>
                  <Headphones className="w-7 h-7" />
                </div>
                <span className={`text-xs font-medium transition-colors ${appMode === 'audio-tutor' ? 'text-white' : 'text-zinc-400'}`}>
                  {t.audioTutorMode}
                </span>
              </button>

              <button
                onClick={() => setAppMode('grapher')}
                className="group flex flex-col items-center gap-3 transition-all duration-300 active:scale-95 relative"
              >
                <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-500 border border-white/10 ${
                  appMode === 'grapher'
                    ? 'bg-white text-black shadow-[0_0_50px_rgba(255,255,255,0.7)] scale-105 z-10'
                    : 'bg-black/40 text-white hover:bg-black/60 z-0'
                }`}>
                  <LineChart className="w-7 h-7" />
                </div>
                <span className={`text-xs font-medium transition-colors ${appMode === 'grapher' ? 'text-white' : 'text-zinc-400'}`}>
                  {t.grapherMode}
                </span>
              </button>

              <button
                onClick={() => setAppMode('reading-coach')}
                className="group flex flex-col items-center gap-3 transition-all duration-300 active:scale-95 relative"
              >
                <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-500 border border-white/10 ${
                  appMode === 'reading-coach'
                    ? 'bg-white text-black shadow-[0_0_50px_rgba(255,255,255,0.7)] scale-105 z-10'
                    : 'bg-black/40 text-white hover:bg-black/60 z-0'
                }`}>
                  <BookOpen className="w-7 h-7" />
                </div>
                <span className={`text-xs font-medium transition-colors ${appMode === 'reading-coach' ? 'text-white' : 'text-zinc-400'}`}>
                  {language === 'zh' ? '朗读纠错' : 'Reading Coach'}
                </span>
              </button>
            </div>
          </div>

          {/* Model Selection */}
          {appMode !== 'reading-coach' && appMode !== 'grapher' && (
            <div className="flex flex-wrap md:flex-nowrap gap-4 justify-center py-2">
              {MODELS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedModel(m.id)}
                  className={`relative group transition-all duration-300 active:scale-95`}
                >
                  <div className={`px-6 py-3 rounded-full flex items-center justify-center transition-all duration-500 border border-white/10 backdrop-blur-md ${
                    selectedModel === m.id 
                      ? 'bg-white text-black shadow-[0_0_30px_rgba(255,255,255,0.5)] scale-105' 
                      : 'bg-black/40 text-zinc-400 hover:text-white hover:bg-black/60'
                  }`}>
                    <span className="font-bold text-xs tracking-wide">{m.name}</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Textbook Association Section */}
          {appMode !== 'reading-coach' && appMode !== 'grapher' && (
            <div className="flex items-center justify-between p-4 rounded-3xl border border-white/5 backdrop-blur-3xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] bg-black/20 liquid-panel">
              <div className="flex items-center gap-4">
                {appMode === 'audio-tutor' && (
                  <>
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <div className={`w-6 h-6 rounded-full border flex items-center justify-center transition-all duration-300 ${associateTextbook ? 'bg-white border-white shadow-[0_0_15px_rgba(255,255,255,0.4)]' : 'border-white/20 group-hover:border-white/50 bg-black/40'}`}>
                        {associateTextbook && <Check className="w-3.5 h-3.5 text-black" />}
                      </div>
                      <input 
                        type="checkbox" 
                        className="hidden" 
                        checked={associateTextbook} 
                        onChange={(e) => setAssociateTextbook(e.target.checked)} 
                      />
                      <span className="text-sm font-medium text-zinc-300 group-hover:text-white transition-colors">
                        {t.associateTextbook}
                      </span>
                    </label>
                    
                    {associateTextbook && (
                      <div className="flex flex-wrap gap-2 mt-2 md:mt-0">
                        {textbooks.map(book => {
                          const isSelected = selectedTextbookIds.includes(book.id);
                          return (
                            <button
                              key={book.id}
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedTextbookIds(prev => prev.filter(id => id !== book.id));
                                } else {
                                  setSelectedTextbookIds(prev => [...prev, book.id]);
                                }
                              }}
                              className={`px-3 py-1 text-xs font-medium rounded-full border transition-all ${
                                isSelected 
                                  ? 'bg-white text-black border-white shadow-[0_0_15px_rgba(255,255,255,0.4)]' 
                                  : 'bg-black/40 border-white/10 text-zinc-400 hover:text-white hover:bg-white/10'
                              }`}
                            >
                              {book.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
              
              <button 
                onClick={() => setShowTextbookManager(true)}
                className="flex items-center gap-2 px-4 py-2 bg-black/40 hover:bg-white/10 border border-white/10 hover:border-white/30 rounded-full text-sm text-zinc-300 hover:text-white transition-all shadow-lg active:scale-95"
              >
                <Book className="w-4 h-4" />
                {t.manageTextbooks}
              </button>
            </div>
          )}

          <div className={appMode === 'grapher' ? 'block flex-1 flex flex-col h-full' : 'hidden'}>
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col gap-6"
            >
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
                {/* Right Panel: Graph */}
                <div className="lg:col-span-8 flex flex-col gap-4 min-h-[500px]">
                  <div className="flex-1 relative">
                    <GraphView 
                      functions={graphFunctions.filter(f => f.visible).map(f => ({ expression: f.expression, color: f.color }))} 
                      parameters={graphParameters}
                    />
                  </div>
                </div>

                {/* Left Panel: Controls */}
                <div className="lg:col-span-4 flex flex-col gap-4">
                  {/* Function List */}
                  <div className="p-4 rounded-3xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl liquid-panel overflow-y-auto max-h-[500px] custom-scrollbar">
                    <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">{language === 'zh' ? '函数列表' : 'Functions'}</h3>
                    <div className="space-y-4">
                      {graphFunctions.map((f) => {
                        const processed = splitImplicitMultiplication(f.expression);
                        const usedParams: string[] = [];
                        try {
                          const node = math.parse(processed.replace(/f\(x\)\s*=/g, '').replace(/y\s*=/g, ''));
                          node.traverse((n: any) => {
                            if (n.type === 'SymbolNode' && graphParameters[n.name]) {
                              if (!usedParams.includes(n.name)) usedParams.push(n.name);
                            }
                          });
                        } catch(e) {}

                        return (
                          <div key={f.id} className="group p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-white/20 transition-all space-y-4">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3 flex-1 overflow-hidden">
                                <div className="relative">
                                  <button 
                                    onClick={() => setGraphFunctions(graphFunctions.map(func => func.id === f.id ? { ...func, visible: !func.visible } : func))}
                                    className={`w-5 h-5 rounded-full border-2 transition-all ${f.visible ? 'bg-current border-transparent' : 'bg-transparent border-zinc-600'}`}
                                    style={{ color: f.color }}
                                  />
                                </div>
                                <div className="flex-1 overflow-hidden">
                                  <InlineMath math={toGraphLatex(f.expression)} />
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button 
                                  onClick={() => setGraphShowColorPicker(graphShowColorPicker === f.id ? null : f.id)}
                                  className={`p-2 rounded-xl transition-all border ${graphShowColorPicker === f.id ? 'bg-white text-black border-white' : 'bg-white/5 text-zinc-400 hover:text-white border-white/5'}`}
                                  style={{ color: graphShowColorPicker === f.id ? undefined : f.color }}
                                  title={language === 'zh' ? '颜色' : 'Color'}
                                >
                                  <Palette className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => { setGraphInputValue(f.expression); setGraphEditingId(f.id); setGraphActiveTab('manual'); }}
                                  className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-zinc-400 hover:text-white transition-all border border-white/5"
                                  title={language === 'zh' ? '编辑' : 'Edit'}
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => setGraphFunctions(graphFunctions.filter(func => func.id !== f.id))}
                                  className="p-2 bg-red-500/10 hover:bg-red-500/20 rounded-xl text-zinc-400 hover:text-red-400 transition-all border border-red-500/10"
                                  title={language === 'zh' ? '删除' : 'Delete'}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>

                            <AnimatePresence>
                              {graphShowColorPicker === f.id && (
                                <motion.div 
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  exit={{ opacity: 0, height: 0 }}
                                  className="overflow-hidden"
                                >
                                  <div className="flex flex-wrap gap-2 py-3 border-t border-white/5">
                                    {COLORS.map(color => (
                                      <button
                                        key={color}
                                        onClick={() => {
                                          setGraphFunctions(graphFunctions.map(func => func.id === f.id ? { ...func, color } : func));
                                          setGraphShowColorPicker(null);
                                        }}
                                        className={`w-6 h-6 rounded-full border-2 transition-all ${f.color === color ? 'scale-110 border-white shadow-[0_0_15px_rgba(255,255,255,0.3)]' : 'border-transparent opacity-60 hover:opacity-100 hover:scale-110'}`}
                                        style={{ backgroundColor: color }}
                                      />
                                    ))}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>

                            {usedParams.length > 0 && (
                              <div className="space-y-4 pt-2 border-t border-white/5">
                                {usedParams.map(paramName => {
                                  const p = graphParameters[paramName];
                                  if (!p) return null;
                                  return (
                                    <div key={p.name} className="space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-mono text-zinc-400 tracking-widest">{p.name} = {p.value.toFixed(2)}</span>
                                        <button onClick={() => {
                                          const next = { ...graphParameters };
                                          delete next[p.name];
                                          setGraphParameters(next);
                                        }} className="p-1 hover:bg-white/10 rounded text-zinc-500 hover:text-white">
                                          <X className="w-3 h-3" />
                                        </button>
                                      </div>
                                      <input 
                                        type="range" 
                                        min={p.min} 
                                        max={p.max} 
                                        step={p.step} 
                                        value={p.value ?? 0}
                                        onChange={(e) => setGraphParameters({ ...graphParameters, [p.name]: { ...p, value: parseFloat(e.target.value) } })}
                                        className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-white"
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {graphFunctions.length === 0 && (
                        <div className="text-center py-8 text-zinc-600">
                          <LineChart className="w-8 h-8 mx-auto mb-2 opacity-20" />
                          <p className="text-xs">{language === 'zh' ? '暂无函数' : 'No functions yet'}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="p-4 rounded-3xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl liquid-panel flex flex-col gap-4">
                    <div className="flex bg-white/5 p-1 rounded-2xl gap-1">
                      <button 
                        onClick={() => setGraphActiveTab('manual')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all ${graphActiveTab === 'manual' ? 'bg-white text-black shadow-lg' : 'text-zinc-500 hover:bg-white/5'}`}
                      >
                        <Keyboard className="w-4 h-4" />
                        {language === 'zh' ? '手动输入' : 'Manual'}
                      </button>
                      <button 
                        onClick={() => setGraphActiveTab('photo')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all ${graphActiveTab === 'photo' ? 'bg-white text-black shadow-lg' : 'text-zinc-500 hover:bg-white/5'}`}
                      >
                        <Camera className="w-4 h-4" />
                        {language === 'zh' ? '拍照识别' : 'Photo Scan'}
                      </button>
                    </div>

                    {graphActiveTab === 'manual' ? (
                      <div className="space-y-4">
                        <div className="relative group">
                          <input
                            ref={graphInputRef}
                            type="text"
                            inputMode="none"
                            value={graphInputValue || ''}
                            onChange={(e) => setGraphInputValue(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addGraphFunction(graphInputValue)}
                            placeholder={language === 'zh' ? '输入函数, 如: y = x^2' : 'Enter function, e.g., y = x^2'}
                            className="w-full bg-black/60 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/30 transition-all font-mono text-sm"
                          />
                          <button 
                            onClick={() => addGraphFunction(graphInputValue)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-white text-black rounded-xl hover:bg-zinc-200 transition-all active:scale-95"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                        <MathKeyboard 
                          onKeyClick={insertAtGraphCursor}
                          onDelete={deleteAtGraphCursor}
                          onClear={() => setGraphInputValue('')}
                          onMoveCursor={moveGraphCursor}
                        />
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Model Selection */}
                        <div className="flex flex-col gap-2 p-3 rounded-2xl bg-white/5 border border-white/5">
                          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">
                            {language === 'zh' ? '识别模型与推理等级' : 'Model & Thinking Level'}
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => setGraphScanMode('gemini-3-flash-low')}
                              className={`flex flex-col items-start p-3 rounded-xl border transition-all ${
                                graphScanMode === 'gemini-3-flash-low'
                                  ? 'bg-white text-black border-white shadow-lg'
                                  : 'bg-white/5 text-zinc-400 border-white/5 hover:bg-white/10'
                              }`}
                            >
                              <span className="text-xs font-bold">Gemini 3 Flash</span>
                              <span className={`text-[10px] ${graphScanMode === 'gemini-3-flash-low' ? 'text-zinc-600' : 'text-zinc-500'}`}>
                                Low Level (Fast)
                              </span>
                            </button>
                            <button
                              onClick={() => setGraphScanMode('gemini-3.1-pro-high')}
                              className={`flex flex-col items-start p-3 rounded-xl border transition-all ${
                                graphScanMode === 'gemini-3.1-pro-high'
                                  ? 'bg-white text-black border-white shadow-lg'
                                  : 'bg-white/5 text-zinc-400 border-white/5 hover:bg-white/10'
                              }`}
                            >
                              <span className="text-xs font-bold">Gemini 3.1 Pro</span>
                              <span className={`text-[10px] ${graphScanMode === 'gemini-3.1-pro-high' ? 'text-zinc-600' : 'text-zinc-500'}`}>
                                High Level (Precise)
                              </span>
                            </button>
                          </div>
                        </div>

                        <div 
                          onClick={() => graphFileInputRef.current?.click()}
                          className="border-2 border-dashed border-white/10 rounded-3xl p-8 text-center cursor-pointer hover:border-white/30 hover:bg-white/5 transition-all group relative overflow-hidden"
                        >
                          <input type="file" ref={graphFileInputRef} onChange={handleGraphFileUpload} accept="image/*" className="hidden" />
                          {graphIsScanning ? (
                            <div className="flex flex-col items-center gap-3">
                              <Loader2 className="w-8 h-8 animate-spin text-white" />
                              <p className="text-sm font-medium text-zinc-300">{language === 'zh' ? '正在识别函数...' : 'Scanning functions...'}</p>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-3">
                              <div className="p-4 rounded-full bg-white/5 text-zinc-400 group-hover:bg-white group-hover:text-black transition-all shadow-lg">
                                <ImageIcon className="w-8 h-8" />
                              </div>
                              <p className="text-sm font-medium text-zinc-300">{language === 'zh' ? '点击上传或拖拽图片' : 'Click to upload or drag image'}</p>
                            </div>
                          )}
                        </div>

                        {graphLastImageData && !graphIsScanning && (
                          <button
                            onClick={regenerateGraphFunctions}
                            className="w-full flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-xs font-bold text-zinc-300 transition-all active:scale-[0.98]"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            {language === 'zh' ? '重新识别当前图片' : 'Regenerate from Current Image'}
                          </button>
                        )}

                        {graphScannedResults.length > 0 && (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{language === 'zh' ? '识别结果' : 'Scanned Results'}</p>
                              <button 
                                onClick={() => {
                                  graphScannedResults.forEach((res, i) => {
                                    if (graphSelectedIndices.has(i)) addGraphFunction(res);
                                  });
                                  setGraphScannedResults([]);
                                }}
                                className="text-xs font-bold text-white bg-white/10 px-3 py-1 rounded-full hover:bg-white hover:text-black transition-all"
                              >
                                {language === 'zh' ? '全部添加' : 'Add All'}
                              </button>
                            </div>
                            <div className="max-h-48 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                              {graphScannedResults.map((res, i) => (
                                <div 
                                  key={i} 
                                  onClick={() => {
                                    const next = new Set(graphSelectedIndices);
                                    if (next.has(i)) next.delete(i); else next.add(i);
                                    setGraphSelectedIndices(next);
                                  }}
                                  className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${graphSelectedIndices.has(i) ? 'bg-white/10 border-white/30' : 'bg-black/20 border-white/5 opacity-50'}`}
                                >
                                  <div className="flex-1 overflow-hidden">
                                    <InlineMath math={toGraphLatex(res)} />
                                  </div>
                                  {graphSelectedIndices.has(i) && <Check className="w-4 h-4 text-white shrink-0" />}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          <div className={appMode === 'audio-tutor' ? 'block flex-1 flex flex-col' : 'hidden'}>
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col"
            >
              <AudioTutorView 
                files={files} 
                setFiles={setFiles} 
                lang={language} 
                associateTextbook={associateTextbook}
                selectedTextbookIds={selectedTextbookIds}
                textbooks={textbooks}
              />
            </motion.div>
          </div>

          <div className={appMode === 'reading-coach' ? 'block flex-1 flex flex-col' : 'hidden'}>
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col"
            >
              <div className="flex-1 min-h-[70vh] rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
                <ReadingCoach lang={language} />
              </div>
            </motion.div>
          </div>

          <div className={appMode === 'extractor' ? 'block flex-1 flex flex-col' : 'hidden'}>
            <AnimatePresence mode="wait">
              {selectedIdx === null ? (
                <motion.div
                  key="extractor-list"
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  transition={{ duration: 0.3 }}
                  className="flex-1 flex flex-col"
                >
                  {/* Model & Upload Section */}
                  <div className="p-1 rounded-2xl border border-white/10 backdrop-blur-2xl shadow-2xl liquid-panel">
                    <div className="p-3 md:p-4 rounded-xl border border-white/5 backdrop-blur-2xl space-y-4 liquid-panel">
                      
                      {/* Hidden Inputs */}
                      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" multiple className="hidden" />
                      <input type="file" ref={cameraInputRef} onChange={handleFileChange} accept="image/*" capture="environment" multiple className="hidden" />

                      {files.length === 0 ? (
                        <div className="flex flex-col md:flex-row gap-4">
                          <div
                            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files) processFiles(e.dataTransfer.files); }}
                            onClick={() => fileInputRef.current?.click()}
                            className={`
                              flex-1 relative border border-white/10 rounded-3xl p-8 text-center cursor-pointer transition-all duration-500
                              ${isDragging ? 'bg-white text-black scale-[0.99] shadow-[0_0_50px_rgba(255,255,255,0.5)]' : 'bg-black/20 hover:bg-black/40 hover:border-white/30'}
                            `}
                          >
                            <div className="flex flex-col items-center gap-4">
                              <div className={`p-4 rounded-full transition-all duration-500 ${isDragging ? 'bg-black text-white' : 'bg-white/5 text-zinc-400 group-hover:bg-white group-hover:text-black shadow-[0_0_20px_rgba(255,255,255,0.1)]'}`}>
                                <Upload className="w-8 h-8" />
                              </div>
                              <p className={`text-sm font-medium transition-colors ${isDragging ? 'text-black' : 'text-zinc-300'}`}>{t.upload}</p>
                            </div>
                          </div>

                          <div
                            onClick={() => cameraInputRef.current?.click()}
                            className="md:w-48 relative border border-white/10 rounded-3xl p-8 text-center cursor-pointer bg-black/20 hover:bg-black/40 hover:border-white/30 transition-all duration-500 group"
                          >
                            <div className="flex flex-col items-center gap-4">
                              <div className="p-4 rounded-full bg-white/5 text-zinc-400 group-hover:bg-white group-hover:text-black transition-all duration-500 shadow-[0_0_20px_rgba(255,255,255,0.1)]">
                                <Camera className="w-8 h-8" />
                              </div>
                              <p className="text-zinc-300 text-sm font-medium">{t.camera}</p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-4">
                          <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                            {previewUrls.map((url, idx) => (
                              <div key={idx} className="relative w-24 md:w-28 aspect-[3/4] bg-black/50 rounded-lg overflow-hidden border border-white/10 group shrink-0 shadow-xl">
                                <img src={url} alt={`Preview ${idx}`} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                                <button onClick={() => removeFile(idx)} className="absolute top-1 right-1 p-1 bg-black/60 backdrop-blur-md text-zinc-300 rounded-full hover:bg-red-500 hover:text-white transition-all shadow-lg">
                                  <Trash2 className="w-2 h-2" />
                                </button>
                              </div>
                            ))}
                            <button 
                              onClick={() => fileInputRef.current?.click()}
                              className="w-24 md:w-28 aspect-[3/4] rounded-lg border-2 border-dashed border-white/20 flex flex-col items-center justify-center gap-1 hover:border-white/40 hover:bg-white/5 transition-all shrink-0 cursor-pointer text-zinc-400 hover:text-white"
                            >
                              <Upload className="w-4 h-4" />
                              <span className="text-[8px] font-medium">{t.add}</span>
                            </button>
                          </div>
                          
                          <div className="flex flex-col justify-center gap-3 w-full">
                            <div className="flex items-center gap-2 text-zinc-300 p-3 rounded-lg border border-white/10 liquid-panel">
                              <FileImage className="w-3.5 h-3.5 text-zinc-500" />
                              <span className="font-medium truncate text-[10px]">{t.selected} {files.length} {language === 'zh' ? '张' : 'images'}</span>
                            </div>
                            
                            <div className="flex gap-2">
                              <button
                                onClick={clearFiles}
                                className="px-4 py-2.5 text-white text-xs font-bold rounded-lg hover:bg-red-500/20 hover:text-red-400 border border-white/10 hover:border-red-500/50 transition-all active:scale-[0.98] liquid-button"
                              >
                                {t.clear}
                              </button>
                              <button
                                onClick={extractQuestions}
                                disabled={loading}
                                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white text-black text-xs font-bold rounded-lg hover:bg-zinc-200 disabled:opacity-50 transition-all active:scale-[0.98] shadow-[0_0_10px_rgba(255,255,255,0.1)]"
                              >
                                {loading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t.parsing}</> : <><Upload className="w-3.5 h-3.5" /> {t.start}</>}
                              </button>
                            </div>
                            
                            {error && (
                              <div className="flex flex-col gap-3 p-4 text-xs text-red-400 bg-red-950/20 rounded-xl border border-red-900/30">
                                <div className="flex items-start gap-3">
                                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                  <p className="break-all">{error}</p>
                                </div>
                                <button
                                  onClick={extractQuestions}
                                  className="self-end px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-md text-red-400 font-bold transition-all"
                                >
                                  {t.retry}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Preview List Section */}
                  <AnimatePresence>
                    {questions.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-6"
                      >
                        <div className="flex items-center justify-between px-4">
                          <h2 className="text-xl font-bold text-white">{t.preview}</h2>
                          <div className="flex items-center gap-3">
                            <button
                              onClick={extractQuestions}
                              disabled={loading}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[10px] text-zinc-300 font-bold uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50"
                            >
                              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                              {language === 'zh' ? '重新生成' : 'Regenerate'}
                            </button>
                            <span className="px-3 py-1 bg-zinc-800 rounded-full text-[10px] text-zinc-400 font-bold uppercase tracking-widest">
                              {questions.length} {t.ready}
                            </span>
                          </div>
                        </div>
                        
                        <div className="grid gap-4">
                          {questions.map((q, idx) => (
                            <QuestionListItem 
                              key={idx} 
                              data={q} 
                              index={idx} 
                              onClick={() => setSelectedIdx(idx)} 
                              lang={language}
                            />
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ) : (
                <motion.div
                  key="extractor-detail"
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  transition={{ duration: 0.3 }}
                  className="flex-1 flex flex-col"
                >
                  <QuestionDetail 
                    data={questions[selectedIdx]} 
                    onBack={() => setSelectedIdx(null)} 
                    onNext={() => setSelectedIdx(prev => prev !== null ? prev + 1 : null)}
                    onPrev={() => setSelectedIdx(prev => prev !== null ? prev - 1 : null)}
                    hasNext={selectedIdx < questions.length - 1}
                    hasPrev={selectedIdx > 0}
                    model={selectedModel}
                    setModel={setSelectedModel}
                    lang={language}
                    textbooks={textbooks}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>

      {showTextbookManager && (
        <TextbookManager onClose={() => setShowTextbookManager(false)} lang={language} />
      )}
    </div>
  );
}
