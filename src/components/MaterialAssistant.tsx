import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { Camera, Send, Loader2, Book, FileText, ImageIcon, RefreshCw, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { Textbook } from './TextbookManager';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export function MaterialAssistant({ lang, materials, onManageMaterials }: { 
  lang: 'zh' | 'en', 
  materials: Textbook[],
  onManageMaterials: () => void
}) {
  const [topic, setTopic] = useState('');
  const [image, setImage] = useState<{ base64: string, mimeType: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(',')[1];
      setImage({ base64, mimeType: file.type });
    };
    reader.readAsDataURL(file);
  };

  const handleGenerate = async () => {
    if (!topic.trim() && !image) {
      setError(lang === 'zh' ? '请输入作文题或上传图片' : 'Please enter a topic or upload an image');
      return;
    }

    if (materials.length === 0) {
      setError(lang === 'zh' ? '请先上传素材书' : 'Please upload a material book first');
      return;
    }

    setLoading(true);
    setError(null);
    setResult('');

    try {
      const parts: any[] = [];
      
      // Add materials
      for (const material of materials) {
        try {
          const response = await fetch(material.url);
          if (!response.ok) throw new Error('Failed to fetch PDF');
          const blob = await response.blob();
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              if (typeof reader.result === 'string') {
                resolve(reader.result.split(',')[1]);
              } else {
                reject(new Error('Failed to read file as base64'));
              }
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          parts.push({ inlineData: { data: base64, mimeType: 'application/pdf' } });
        } catch (err) {
          console.error("Failed to fetch material PDF", err);
        }
      }

      if (image) {
        parts.push({ inlineData: { data: image.base64, mimeType: image.mimeType } });
      }

      const promptText = lang === 'zh' 
        ? `请根据提供的作文题（文本或图片），从提供的素材书中提取贴合该作文题的各类素材。
作文题：${topic}

要求：
1. 深入分析作文题的立意。
2. 从素材书中提取相关的名人名言、典型事例、文学典故等。
3. 给出每条素材在写作中的具体运用建议。
4. 必须明确指出素材在素材书中的具体位置（如页码或章节）。
5. 使用 Markdown 格式输出，结构清晰。`
        : `Based on the provided essay topic (text or image), extract various materials from the provided material book that fit the topic.
Topic: ${topic}

Requirements:
1. Analyze the core theme of the essay topic.
2. Extract relevant quotes, typical examples, literary allusions, etc. from the material book.
3. Provide specific suggestions on how to use each material in writing.
4. You MUST explicitly state the specific location of the material in the material book (e.g., page number or chapter).
5. Use Markdown format with clear structure.`;

      parts.push({ text: promptText });

      const response = await ai.models.generateContentStream({
        model: 'gemini-3.1-pro-preview',
        contents: { parts },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
        }
      });

      for await (const chunk of response) {
        setResult(prev => prev + (chunk.text || ''));
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error generating materials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full gap-4 p-4 md:p-6">
      <div className="flex flex-col gap-4">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Book className="w-5 h-5 text-emerald-400" />
              <h3 className="text-sm font-bold text-white">
                {lang === 'zh' ? `已关联素材书 (${materials.length}本)` : `Associated Material Books (${materials.length})`}
              </h3>
            </div>
            <button 
              onClick={onManageMaterials}
              className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl text-xs text-zinc-300 hover:text-white transition-all active:scale-95"
            >
              <Book className="w-3.5 h-3.5" />
              {lang === 'zh' ? '管理素材' : 'Manage Materials'}
            </button>
          </div>
          {materials.length === 0 ? (
            <p className="text-xs text-zinc-400">
              {lang === 'zh' ? '请点击上方“管理素材”上传素材书' : 'Please click "Manage Materials" above to upload material books'}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {materials.map(m => (
                <span key={m.id} className="px-3 py-1 bg-white/10 rounded-full text-xs text-zinc-300 border border-white/5">
                  {m.name}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-4">
          <div className="relative">
            <textarea
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder={lang === 'zh' ? '输入作文题...' : 'Enter essay topic...'}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/30 resize-none min-h-[100px]"
            />
          </div>
          
          <div className="flex items-center gap-3">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              accept="image/*" 
              className="hidden" 
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-sm text-white transition-colors border border-white/10"
            >
              <Camera className="w-4 h-4" />
              {lang === 'zh' ? '拍照/传图' : 'Upload Image'}
            </button>
            {image && (
              <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-400/10 px-3 py-2 rounded-xl border border-emerald-400/20">
                <Check className="w-4 h-4" />
                {lang === 'zh' ? '已上传图片' : 'Image uploaded'}
                <button onClick={() => setImage(null)} className="ml-2 text-emerald-400 hover:text-emerald-300">
                  ×
                </button>
              </div>
            )}
            <div className="flex-1"></div>
            <button
              onClick={handleGenerate}
              disabled={loading || (!topic.trim() && !image) || materials.length === 0}
              className="flex items-center gap-2 px-6 py-2 bg-white text-black hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-sm font-bold transition-all shadow-[0_0_20px_rgba(255,255,255,0.3)] active:scale-95"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {lang === 'zh' ? '生成素材' : 'Generate'}
            </button>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      </div>

      {(result || loading) && (
        <div className="flex-1 bg-white/5 border border-white/10 rounded-2xl p-6 overflow-y-auto custom-scrollbar">
          {loading && !result ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-zinc-400">
              <Loader2 className="w-8 h-8 animate-spin" />
              <p className="text-sm">{lang === 'zh' ? '正在翻阅素材书并提取素材...' : 'Extracting materials...'}</p>
            </div>
          ) : (
            <div className="prose prose-invert prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                {result}
              </ReactMarkdown>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
