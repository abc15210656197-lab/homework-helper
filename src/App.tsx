import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeKatex from 'rehype-katex';
import { Upload, Copy, Check, FileImage, Loader2, Trash2, AlertCircle, Camera, ArrowLeft, Info, BookOpen, ChevronRight, MessageCircle, Mic, Send, ChevronLeft, Maximize2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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
  explanation: string;
  precautions: string;
}

const MODELS = [
  { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', desc: '最强推理，适合复杂题目' },
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', desc: '速度最快，响应迅速' },
];

const TRANSLATIONS = {
  zh: {
    title: '题目提取器',
    subtitle: '智能识别题目，一键提取题干、详解与注意事项。',
    upload: '上传图片',
    camera: '拍照识别',
    add: '添加',
    clear: '清空',
    start: '开始提取',
    parsing: '解析中...',
    selected: '已选',
    preview: '识别预览',
    ready: '题已就绪',
    back: '返回列表',
    questionContent: '题干内容',
    copy: '复制题干',
    copied: '已复制',
    explanation: '讲解与分析',
    precautions: '注意事项',
    aiChat: 'AI 智能答疑',
    askMe: '对这道题还有疑问？试试快速提问：',
    placeholder: '输入你的问题，按 Enter 发送...',
    thinking: 'AI 思考中...',
    summaryAction: '总结考点',
    exampleAction: '举个例子',
    pitfallAction: '易错点提醒',
    retry: '重试',
  },
  en: {
    title: 'Question Extractor',
    subtitle: 'Smartly identify questions, extract text, explanations, and tips with one click.',
    upload: 'Upload Image',
    camera: 'Camera Scan',
    add: 'Add',
    clear: 'Clear',
    start: 'Extract Now',
    parsing: 'Parsing...',
    selected: 'Selected',
    preview: 'Preview Results',
    ready: 'questions ready',
    back: 'Back to List',
    questionContent: 'Question Text',
    copy: 'Copy Text',
    copied: 'Copied',
    explanation: 'Explanation & Analysis',
    precautions: 'Important Notes',
    aiChat: 'AI Tutor',
    askMe: 'Have questions? Try quick actions:',
    placeholder: 'Type your question, press Enter...',
    thinking: 'AI is thinking...',
    summaryAction: 'Summarize Key Points',
    exampleAction: 'Give an Example',
    pitfallAction: 'Common Pitfalls',
    retry: 'Retry',
  }
};

function ChatBox({ data, model, setModel, lang }: { data: QuestionData, model: string, setModel: (m: string) => void, lang: 'zh' | 'en' }) {
  const [messages, setMessages] = useState<{role: 'user' | 'model', text: string}[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const t = TRANSLATIONS[lang];

  useEffect(() => {
    setMessages([]);
    setInput('');
  }, [data.question]);

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

      const systemInstruction = `You are a helpful AI tutor. The user is asking about the following question:\n\nQuestion:\n${data.question}\n\nExplanation:\n${data.explanation}\n\nPrecautions:\n${data.precautions}\n\nAnswer the user's questions based on this context in ${lang === 'zh' ? 'Chinese' : 'English'}. 

CRITICAL INSTRUCTIONS:
- Use STRICT LaTeX for ALL math symbols, chemical formulas (e.g., $Cl_2$, $H_2O$, $Na^+$, $SO_4^{2-}$), units (e.g., $mol/L$, $g/cm^3$), and formatting.
- **Wrap EVERY single math/formula/unit/equation in $ for inline or $$ for block math. This is MANDATORY for chemical equations like $2NO_2 \rightleftharpoons N_2O_4$.**
- Example: Use $Cl_2$ instead of Cl2, use $1 \text{ mol}$ instead of 1mol, use $2H_2 + O_2 \rightarrow 2H_2O$ for equations.
- **For multiple-choice questions, ensure each option (A, B, C, D) starts on a NEW line.**
- Be concise and professional.
- Ensure all backslashes in LaTeX are properly escaped if you are returning JSON (though here you are returning raw text, still be careful with escape characters).`;

      const response = await ai.models.generateContent({
        model: model,
        contents: [
          ...history,
          { role: 'user', parts: [{ text: messageToSend }] }
        ],
        config: {
          systemInstruction,
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
          <div className="p-1.5 bg-indigo-500/20 rounded-lg ring-1 ring-indigo-500/30">
            <MessageCircle className="w-4 h-4 text-indigo-400" />
          </div>
          <h4 className="font-semibold text-sm text-white tracking-tight">{t.aiChat}</h4>
        </div>
        <div className="flex items-center gap-2">
          <select 
            value={model} 
            onChange={e => setModel(e.target.value)}
            className="bg-zinc-900/80 border border-zinc-700 text-zinc-300 text-[10px] rounded-md px-1.5 py-1 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer backdrop-blur-md"
          >
            {MODELS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <button 
            onClick={() => setIsFullScreen(!isFullScreen)}
            className="p-1.5 bg-white/5 border border-white/10 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-all active:scale-95"
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
            <div className={`max-w-[90%] rounded-2xl px-3 py-2 ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-200'}`}>
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
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder={t.placeholder}
          className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500 resize-none min-h-[40px] max-h-32"
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
          className="p-3 rounded-xl bg-indigo-600 text-white disabled:opacity-50 hover:bg-indigo-700 transition-colors"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div className="bg-black/40 rounded-2xl border border-white/10 p-4 md:p-5 backdrop-blur-3xl mt-4 shadow-[0_0_30px_rgba(0,0,0,0.5)] ring-1 ring-white/5">
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
              className="w-full max-w-4xl h-full max-h-[90vh] bg-zinc-900/50 border border-white/10 rounded-3xl p-6 overflow-hidden flex flex-col shadow-2xl ring-1 ring-white/10"
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
  data, onBack, onNext, onPrev, hasNext, hasPrev, model, setModel, lang 
}: { 
  data: QuestionData; onBack: () => void; onNext: () => void; onPrev: () => void; hasNext: boolean; hasPrev: boolean; model: string; setModel: (m: string) => void; lang: 'zh' | 'en';
}) {
  const [copied, setCopied] = useState(false);
  const [touchStart, setTouchStart] = useState<{x: number, y: number} | null>(null);
  const [touchEnd, setTouchEnd] = useState<{x: number, y: number} | null>(null);
  const [fullScreenPanel, setFullScreenPanel] = useState<'question' | 'explanation' | 'precautions' | null>(null);
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

  const PanelHeader = ({ title, icon: Icon, type, showCopy }: { title: string, icon: any, type: 'question' | 'explanation' | 'precautions', showCopy?: boolean }) => (
    <div className="flex items-center justify-between px-5 py-2.5 border-b border-white/5 bg-white/5">
      <div className="flex items-center gap-2">
        <div className={`p-1.5 rounded-lg ring-1 ${
          type === 'question' ? 'bg-indigo-500/20 ring-indigo-500/30' : 
          type === 'explanation' ? 'bg-emerald-500/20 ring-emerald-500/30' : 
          'bg-amber-500/20 ring-amber-500/30'
        }`}>
          <Icon className={`w-4 h-4 ${
            type === 'question' ? 'text-indigo-400' : 
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

      <div className="bg-black/40 rounded-2xl border border-white/10 overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.6)] backdrop-blur-3xl ring-1 ring-white/5">
        <PanelHeader title={t.questionContent} icon={BookOpen} type="question" showCopy />
        {QuestionContent(false)}
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div className="bg-black/40 rounded-2xl border border-white/10 p-4 md:p-5 backdrop-blur-3xl ring-1 ring-white/5">
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

        <div className="bg-black/40 rounded-2xl border border-white/10 p-4 md:p-5 backdrop-blur-3xl ring-1 ring-white/5">
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
      
      <ChatBox data={data} model={model} setModel={setModel} lang={lang} />

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
              className="w-full max-w-4xl h-full max-h-[90vh] bg-zinc-900/50 border border-white/10 rounded-3xl overflow-hidden flex flex-col shadow-2xl ring-1 ring-white/10"
            >
              {fullScreenPanel === 'question' && (
                <>
                  <PanelHeader title={t.questionContent} icon={BookOpen} type="question" showCopy />
                  {QuestionContent(true)}
                </>
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
      className="group bg-black/40 hover:bg-black/60 border border-white/10 hover:border-white/20 p-3.5 rounded-xl cursor-pointer transition-all duration-300 flex items-center justify-between shadow-lg backdrop-blur-2xl"
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
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:3rem_3rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
      {verticalLines.map((line, i) => (
        <motion.div
          key={`v-${i}`}
          className="absolute w-[1px] h-[30vh] bg-gradient-to-b from-transparent via-white/40 to-transparent shadow-[0_0_15px_rgba(255,255,255,0.3)]"
          style={{ left: line.left, top: '-30vh' }}
          animate={{ top: '130vh' }}
          transition={{ duration: line.duration, repeat: Infinity, ease: "linear", delay: line.delay }}
        />
      ))}
      {horizontalLines.map((line, i) => (
        <motion.div
          key={`h-${i}`}
          className="absolute h-[1px] w-[30vw] bg-gradient-to-r from-transparent via-white/40 to-transparent shadow-[0_0_15px_rgba(255,255,255,0.3)]"
          style={{ top: line.top, left: '-30vw' }}
          animate={{ left: '130vw' }}
          transition={{ duration: line.duration, repeat: Infinity, ease: "linear", delay: line.delay }}
        />
      ))}
    </div>
  );
}

export default function App() {
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gemini-3-flash-preview');
  const [language, setLanguage] = useState<'zh' | 'en'>('zh');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const t = TRANSLATIONS[language];

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

      const response = await ai.models.generateContent({
        model: selectedModel,
        contents: {
          parts: [
            ...imageParts,
            {
              text: `Analyze the provided image and extract all questions. For each question, provide:
1. summary: A short summary.
2. question: The full question text (题干). Use standard Markdown table syntax for tables.
3. explanation: A detailed explanation and solution (讲解).
4. precautions: Important notes, common pitfalls, or tips (注意事项).

CRITICAL INSTRUCTIONS:
- OUTPUT LANGUAGE: ${language === 'zh' ? 'Chinese' : 'English'}.
- Use STRICT LaTeX for ALL math symbols, chemical formulas (e.g., $Cl_2$, $H_2O$, $Na^+$, $SO_4^{2-}$), units (e.g., $mol/L$, $g/cm^3$), and formatting.
- **Wrap EVERY single math/formula/unit/equation in $ for inline or $$ for block math. This is MANDATORY for chemical equations like $2NO_2 \rightleftharpoons N_2O_4$.**
- Example: Use $Cl_2$ instead of Cl2, use $1 \text{ mol}$ instead of 1mol, use $2H_2 + O_2 \rightarrow 2H_2O$ for equations.
- Preserve the original layout in the "question" field. **For multiple-choice questions, ensure each option (A, B, C, D) starts on a NEW line.**
- Return the result as a JSON array of objects.
- Ensure all backslashes in LaTeX are properly escaped in the JSON string (e.g., "\\\\text" for \text).`,
            },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                summary: { type: Type.STRING },
                question: { type: Type.STRING },
                explanation: { type: Type.STRING },
                precautions: { type: Type.STRING },
              },
              required: ['summary', 'question', 'explanation', 'precautions'],
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
    <div className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-zinc-800 selection:text-white relative">
      <BackgroundLines />
      <div className="max-w-4xl mx-auto px-4 py-4 md:py-8 relative z-10">
        <header className="mb-4 text-center p-3 rounded-2xl bg-black/40 border border-white/10 backdrop-blur-2xl shadow-2xl relative">
          <div className="absolute top-3 right-3">
            <button
              onClick={() => setLanguage(prev => prev === 'zh' ? 'en' : 'zh')}
              className="px-2 py-1 bg-white/10 hover:bg-white/20 border border-white/10 rounded-md text-[10px] font-bold text-zinc-300 transition-all flex items-center gap-1"
            >
              <span className="text-indigo-400">🌐</span>
              {language === 'zh' ? 'EN' : '中文'}
            </button>
          </div>
          <motion.h1 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-2xl md:text-4xl font-bold tracking-tight text-white mb-1"
          >
            {t.title} <span className="text-indigo-500">Pro</span>
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

        <main className="space-y-6">
          {selectedIdx === null ? (
            <>
              {/* Model & Upload Section */}
              <div className="bg-black/40 p-1 rounded-2xl border border-white/10 backdrop-blur-2xl shadow-2xl">
                <div className="bg-black/40 p-3 md:p-4 rounded-xl border border-white/5 backdrop-blur-2xl space-y-4">
                  
                  {/* Hidden Inputs */}
                  <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" multiple className="hidden" />
                  <input type="file" ref={cameraInputRef} onChange={handleFileChange} accept="image/*" capture="environment" multiple className="hidden" />

                  {/* Model Selection */}
                  {files.length === 0 && (
                    <div className="flex flex-wrap md:flex-nowrap gap-1">
                      {MODELS.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => setSelectedModel(m.id)}
                          className={`flex-1 min-w-[90px] p-2 rounded-md border text-left transition-all duration-300 backdrop-blur-md ${
                            selectedModel === m.id 
                              ? 'bg-white/90 border-white text-black shadow-[0_0_10px_rgba(255,255,255,0.2)]' 
                              : 'bg-black/40 border-white/10 text-zinc-400 hover:border-white/30 hover:bg-black/60'
                          }`}
                        >
                          <div className="font-bold text-[9px] truncate">{m.name}</div>
                        </button>
                      ))}
                    </div>
                  )}

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
                        <div className="flex items-center gap-2 text-zinc-300 bg-black/40 p-3 rounded-lg border border-white/10">
                          <FileImage className="w-3.5 h-3.5 text-zinc-500" />
                          <span className="font-medium truncate text-[10px]">{t.selected} {files.length} {language === 'zh' ? '张' : 'images'}</span>
                        </div>
                        
                        <div className="flex gap-2">
                          <button
                            onClick={clearFiles}
                            className="px-4 py-2.5 bg-black/40 text-white text-xs font-bold rounded-lg hover:bg-red-500/20 hover:text-red-400 border border-white/10 hover:border-red-500/50 transition-all active:scale-[0.98]"
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
                      <span className="px-3 py-1 bg-zinc-800 rounded-full text-[10px] text-zinc-400 font-bold uppercase tracking-widest">
                        {questions.length} {t.ready}
                      </span>
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
            </>
          ) : (
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
            />
          )}
        </main>
      </div>
    </div>
  );
}
