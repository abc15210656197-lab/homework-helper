import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { supabase } from '../supabase';
import { Book, Upload, Trash2, Loader2, AlertCircle, X, Link as LinkIcon, FileText } from 'lucide-react';

export interface Textbook {
  id: string;
  name: string;
  url: string;
  fileId: string;
  createdAt: any;
}

export function TextbookManager({ onClose, lang }: { onClose: () => void, lang: 'zh' | 'en' }) {
  const [textbooks, setTextbooks] = useState<Textbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadMode, setUploadMode] = useState<'file' | 'url'>('file');
  const [urlInput, setUrlInput] = useState('');
  const [urlNameInput, setUrlNameInput] = useState('');

  useEffect(() => {
    if (!db) {
      setError(lang === 'zh' ? 'Firebase 未配置。请在环境变量中配置 Firebase。' : 'Firebase is not configured. Please configure Firebase in environment variables.');
      setLoading(false);
      return;
    }
    loadTextbooks();
  }, []);

  const loadTextbooks = async () => {
    if (!db) return;
    try {
      const querySnapshot = await getDocs(collection(db, 'textbooks'));
      const books: Textbook[] = [];
      querySnapshot.forEach((doc) => {
        books.push({ id: doc.id, ...doc.data() } as Textbook);
      });
      setTextbooks(books.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis()));
    } catch (err: any) {
      if (err.message === 'Failed to fetch') {
        setError(lang === 'zh' ? '网络请求失败。请检查您的网络连接，或确保代理软件已开启全局模式（Firebase 在国内无法直接访问）。' : 'Network request failed. Please check your connection or proxy settings.');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !db) return;

    if (file.type !== 'application/pdf') {
      setError(lang === 'zh' ? '只能上传 PDF 文件。' : 'Only PDF files are allowed.');
      return;
    }

    if (!supabase) {
      setError(lang === 'zh' ? 'Supabase 未配置。请在环境变量中配置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY。' : 'Supabase is not configured. Please configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in environment variables.');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const fileId = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      
      const { data, error: uploadError } = await supabase.storage
        .from('textbooks')
        .upload(fileId, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('textbooks')
        .getPublicUrl(fileId);

      await addDoc(collection(db, 'textbooks'), {
        name: file.name,
        url: publicUrl,
        fileId: `supabase-${fileId}`,
        createdAt: serverTimestamp()
      });

      await loadTextbooks();
    } catch (err: any) {
      if (err.message === 'Failed to fetch') {
        setError(lang === 'zh' ? '网络请求失败。请检查您的网络连接，或确保代理软件已开启全局模式（Firebase 在国内无法直接访问）。' : 'Network request failed. Please check your connection or proxy settings.');
      } else {
        setError(err.message);
      }
    } finally {
      setUploading(false);
    }
  };

  const handleAddUrl = async () => {
    if (!urlInput.trim() || !urlNameInput.trim() || !db) {
      setError(lang === 'zh' ? '请填写教材名称和链接。' : 'Please provide both name and URL.');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      await addDoc(collection(db, 'textbooks'), {
        name: urlNameInput.trim() + (urlNameInput.toLowerCase().endsWith('.pdf') ? '' : '.pdf'),
        url: urlInput.trim(),
        fileId: 'url-' + Date.now(),
        createdAt: serverTimestamp()
      });

      setUrlInput('');
      setUrlNameInput('');
      await loadTextbooks();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (book: Textbook) => {
    if (!db) return;
    
    try {
      if (supabase && book.fileId && book.fileId.startsWith('supabase-')) {
        const actualFileId = book.fileId.replace('supabase-', '');
        const { error: deleteError } = await supabase.storage
          .from('textbooks')
          .remove([actualFileId]);
          
        if (deleteError) {
          console.error("Failed to delete file from Supabase storage:", deleteError);
        }
      }
      
      await deleteDoc(doc(db, 'textbooks', book.id));
      setTextbooks(textbooks.filter(b => b.id !== book.id));
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Book className="w-5 h-5 text-indigo-400" />
            {lang === 'zh' ? '教材管理' : 'Manage Textbooks'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg text-zinc-400 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3 text-red-400">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="text-sm">{error}</div>
            </div>
          )}

          <div className="mb-6">
            <div className="flex items-center gap-2 mb-4 p-1 bg-white/5 rounded-lg w-fit">
              <button
                onClick={() => setUploadMode('file')}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${uploadMode === 'file' ? 'bg-indigo-500 text-white shadow-md' : 'text-zinc-400 hover:text-white'}`}
              >
                <FileText className="w-4 h-4" />
                {lang === 'zh' ? '本地上传' : 'Local File'}
              </button>
              <button
                onClick={() => setUploadMode('url')}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${uploadMode === 'url' ? 'bg-indigo-500 text-white shadow-md' : 'text-zinc-400 hover:text-white'}`}
              >
                <LinkIcon className="w-4 h-4" />
                {lang === 'zh' ? '链接导入 / Supabase 导入' : 'Import URL / Supabase'}
              </button>
            </div>

            {uploadMode === 'file' ? (
              <label className="flex items-center justify-center w-full p-8 border-2 border-dashed border-white/20 rounded-xl hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all cursor-pointer group">
                <div className="flex flex-col items-center gap-2 text-zinc-400 group-hover:text-indigo-400">
                  {uploading ? (
                    <Loader2 className="w-8 h-8 animate-spin" />
                  ) : (
                    <Upload className="w-8 h-8" />
                  )}
                  <span className="font-medium">
                    {uploading 
                      ? (lang === 'zh' ? '上传中...' : 'Uploading...') 
                      : (lang === 'zh' ? '点击上传 PDF 教材 (最大 50MB)' : 'Click to upload PDF textbook (Max 50MB)')}
                  </span>
                  <span className="text-xs text-zinc-500 text-center mt-2">
                    {lang === 'zh' 
                      ? '如果文件超过 50MB，请直接在 Supabase 控制台上传，然后使用右侧的“链接导入”。' 
                      : 'If the file exceeds 50MB, upload it directly in the Supabase console and use "Import URL".'}
                  </span>
                </div>
                <input type="file" accept="application/pdf" className="hidden" onChange={handleUpload} disabled={uploading || !db} />
              </label>
            ) : (
              <div className="space-y-4 p-5 border border-white/10 rounded-xl bg-white/5">
                <div className="text-xs text-zinc-400 bg-zinc-900/50 p-3 rounded-lg border border-white/5 mb-2">
                  {lang === 'zh' 
                    ? '你可以直接在 Supabase 控制台的 Storage 中上传超大文件。上传后点击文件，选择 "Get URL"，然后将链接粘贴到下方。' 
                    : 'You can upload large files directly in Supabase Storage console. Click the file, select "Get URL", and paste it below.'}
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">{lang === 'zh' ? '教材名称' : 'Textbook Name'}</label>
                  <input 
                    type="text" 
                    value={urlNameInput}
                    onChange={e => setUrlNameInput(e.target.value)}
                    placeholder={lang === 'zh' ? '例如：高等数学上册' : 'e.g. Calculus Vol 1'}
                    className="w-full bg-zinc-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">{lang === 'zh' ? 'PDF 直链地址' : 'Direct PDF URL'}</label>
                  <input 
                    type="url" 
                    value={urlInput}
                    onChange={e => setUrlInput(e.target.value)}
                    placeholder="https://example.com/book.pdf"
                    className="w-full bg-zinc-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
                <button 
                  onClick={handleAddUrl}
                  disabled={uploading || !urlInput.trim() || !urlNameInput.trim()}
                  className="w-full py-2 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LinkIcon className="w-4 h-4" />}
                  {lang === 'zh' ? '添加链接' : 'Add URL'}
                </button>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
              {lang === 'zh' ? '已上传的教材' : 'Uploaded Textbooks'}
            </h3>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
              </div>
            ) : textbooks.length === 0 ? (
              <div className="text-center py-8 text-zinc-500 text-sm">
                {lang === 'zh' ? '暂无教材' : 'No textbooks uploaded yet.'}
              </div>
            ) : (
              textbooks.map(book => (
                <div key={book.id} className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <Book className="w-5 h-5 text-indigo-400 shrink-0" />
                    <span className="text-sm font-medium text-zinc-200 truncate">{book.name}</span>
                  </div>
                  <button 
                    onClick={() => handleDelete(book)}
                    className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
                    title={lang === 'zh' ? '删除' : 'Delete'}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
