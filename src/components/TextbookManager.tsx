import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, serverTimestamp, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { supabase } from '../supabase';
import { Book, Upload, Trash2, Loader2, AlertCircle, X, Link as LinkIcon, FileText, Folder, Plus, Check, FolderInput } from 'lucide-react';

export interface TextbookGroup {
  id: string;
  name: string;
  createdAt: any;
}

export interface Textbook {
  id: string;
  name: string;
  url: string;
  fileId: string;
  createdAt: any;
  groupId?: string;
}

export function TextbookManager({ onClose, lang, type = 'textbook', isAdmin = false, uid }: { onClose: () => void, lang: 'zh' | 'en', type?: 'textbook' | 'material', isAdmin?: boolean, uid?: string }) {
  const [textbooks, setTextbooks] = useState<Textbook[]>([]);
  const [groups, setGroups] = useState<TextbookGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadMode, setUploadMode] = useState<'file' | 'url'>('file');
  const [urlInput, setUrlInput] = useState('');
  const [urlNameInput, setUrlNameInput] = useState('');
  const [isAddingGroup, setIsAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [moveTargetId, setMoveTargetId] = useState<string | null>(null);

  const collectionName = type === 'material' ? 'materials' : 'textbooks';
  const storageKey = type === 'material' ? 'materials' : 'textbooks';
  const groupsCollectionName = type === 'material' ? 'material_groups' : 'textbook_groups';
  const groupsStorageKey = type === 'material' ? 'material_groups' : 'textbook_groups';
  const title = type === 'material' ? (lang === 'zh' ? '素材管理' : 'Manage Materials') : (lang === 'zh' ? '教材管理' : 'Manage Textbooks');
  const emptyText = type === 'material' ? (lang === 'zh' ? '暂无素材' : 'No materials uploaded yet.') : (lang === 'zh' ? '暂无教材' : 'No textbooks uploaded yet.');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    await Promise.all([loadGroups(), loadTextbooks()]);
    setLoading(false);
  };

  const loadGroups = async () => {
    try {
      if (!db) throw new Error('Firebase not configured');
      let q = collection(db, groupsCollectionName) as any;
      if (type === 'material' && uid) {
        q = query(q, where('uid', '==', uid));
      }
      const querySnapshot = await getDocs(q);
      const loadedGroups: TextbookGroup[] = [];
      querySnapshot.forEach((doc) => {
        loadedGroups.push({ id: doc.id, ...(doc.data() as any) } as TextbookGroup);
      });

      // Merge with local storage if Firestore is empty
      if (loadedGroups.length === 0) {
        const localGroups = localStorage.getItem(groupsStorageKey);
        if (localGroups) {
          try {
            const parsed = JSON.parse(localGroups);
            if (type === 'material' && uid) {
              loadedGroups.push(...(parsed as any[]).filter((g: any) => g.uid === uid));
            } else {
              loadedGroups.push(...(parsed as any[]));
            }
          } catch (e) {
            // ignore
          }
        }
      }

      setGroups(loadedGroups.sort((a, b) => {
        const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : (a.createdAt || 0));
        const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : (b.createdAt || 0));
        return bTime - aTime;
      }));
    } catch (err: any) {
      const localGroups = localStorage.getItem(groupsStorageKey);
      if (localGroups) {
        try {
          const parsed = JSON.parse(localGroups);
          if (type === 'material' && uid) {
            setGroups(parsed.filter((g: any) => g.uid === uid));
          } else {
            setGroups(parsed);
          }
        } catch (e) {
          setGroups([]);
        }
      }
    }
  };

  const loadTextbooks = async () => {
    try {
      if (!db) throw new Error('Firebase not configured');
      let q = collection(db, collectionName) as any;
      if (type === 'material' && uid) {
        q = query(q, where('uid', '==', uid));
      }
      const querySnapshot = await getDocs(q);
      const books: Textbook[] = [];
      querySnapshot.forEach((doc) => {
        books.push({ id: doc.id, ...(doc.data() as any) } as Textbook);
      });

      // Merge with local storage if Firestore is empty
      if (books.length === 0) {
        const localBooks = localStorage.getItem(storageKey);
        if (localBooks) {
          try {
            const parsed = JSON.parse(localBooks);
            if (type === 'material' && uid) {
              books.push(...(parsed as any[]).filter((b: any) => b.uid === uid));
            } else {
              books.push(...(parsed as any[]));
            }
          } catch (e) {
            // ignore
          }
        }
      }

      setTextbooks(books.sort((a, b) => {
        const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : (a.createdAt || 0));
        const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : (b.createdAt || 0));
        return bTime - aTime;
      }));
    } catch (err: any) {
      console.warn("Firebase error, falling back to localStorage:", err);
      const localBooks = localStorage.getItem(storageKey);
      if (localBooks) {
        try {
          const parsed = JSON.parse(localBooks);
          let filtered = parsed;
          if (type === 'material' && uid) {
            filtered = parsed.filter((b: any) => b.uid === uid);
          }
          // Sort local books by simulated createdAt
          setTextbooks(filtered.sort((a: any, b: any) => (b.createdAt?.seconds || b.createdAt || 0) - (a.createdAt?.seconds || a.createdAt || 0)));
        } catch (e) {
          setTextbooks([]);
        }
      } else {
        setTextbooks([]);
      }
      
      if (err.message === 'Failed to fetch') {
        setError(lang === 'zh' ? '网络请求失败。正在使用本地存储模式。' : 'Network request failed. Using local storage mode.');
      } else if (err.message.includes('Database')) {
        // Don't show error for missing database, just silently use local storage
      } else if (err.message !== 'Firebase not configured') {
        setError(err.message);
      }
    }
  };

  const handleConfirmCreateGroup = async () => {
    if (!newGroupName || !newGroupName.trim()) return;
    const name = newGroupName.trim();
    
    try {
      if (db) {
        const groupData: any = {
          name: name,
          createdAt: serverTimestamp()
        };
        if (type === 'material' && uid) {
          groupData.uid = uid;
        }
        await addDoc(collection(db, groupsCollectionName), groupData);
      } else {
        throw new Error('Firebase not configured');
      }
    } catch (err) {
      const newGroup: any = {
        id: `local-group-${Date.now()}`,
        name: name,
        createdAt: Date.now()
      };
      if (type === 'material' && uid) {
        newGroup.uid = uid;
      }
      const localGroups = JSON.parse(localStorage.getItem(groupsStorageKey) || '[]');
      localGroups.push(newGroup);
      localStorage.setItem(groupsStorageKey, JSON.stringify(localGroups));
    }
    setNewGroupName('');
    setIsAddingGroup(false);
    await loadGroups();
  };

  const handleDeleteGroup = async (groupId: string) => {
    // Ungroup books
    const booksInGroup = textbooks.filter(b => b.groupId === groupId);
    for (const book of booksInGroup) {
      try {
        if (book.id.startsWith('local-')) {
          const localBooks = JSON.parse(localStorage.getItem(storageKey) || '[]');
          const updatedBooks = localBooks.map((b: any) => b.id === book.id ? { ...b, groupId: undefined } : b);
          localStorage.setItem(storageKey, JSON.stringify(updatedBooks));
        } else if (db) {
          await updateDoc(doc(db, collectionName, book.id), { groupId: null });
        }
      } catch (e) {
        console.error("Failed to ungroup book", e);
      }
    }

    // Delete group
    try {
      if (groupId.startsWith('local-')) {
        const localGroups = JSON.parse(localStorage.getItem(groupsStorageKey) || '[]');
        const updatedGroups = localGroups.filter((g: any) => g.id !== groupId);
        localStorage.setItem(groupsStorageKey, JSON.stringify(updatedGroups));
      } else if (db) {
        await deleteDoc(doc(db, groupsCollectionName, groupId));
      }
    } catch (e) {
      console.error("Failed to delete group", e);
    }

    await loadData();
  };

  const handleMoveToGroup = async (bookId: string, groupId: string | null) => {
    // Optimistic update
    setTextbooks(prev => prev.map(b => b.id === bookId ? { ...b, groupId: groupId || undefined } : b));

    try {
      if (bookId.startsWith('local-')) {
        const localBooks = JSON.parse(localStorage.getItem(storageKey) || '[]');
        const updatedBooks = localBooks.map((b: any) => b.id === bookId ? { ...b, groupId: groupId || undefined } : b);
        localStorage.setItem(storageKey, JSON.stringify(updatedBooks));
      } else if (db) {
        await updateDoc(doc(db, collectionName, bookId), {
          groupId: groupId || null
        });
      }
    } catch (err) {
      console.error("Failed to update group", err);
      await loadTextbooks(); // revert on failure
    }
    setMoveTargetId(null);
  };

  const handleDragStart = (e: React.DragEvent, bookId: string) => {
    e.dataTransfer.setData('text/plain', bookId);
  };

  const handleDrop = async (e: React.DragEvent, groupId: string | null) => {
    e.preventDefault();
    const bookId = e.dataTransfer.getData('text/plain');
    if (!bookId) return;

    // Optimistic update
    setTextbooks(prev => prev.map(b => b.id === bookId ? { ...b, groupId: groupId || undefined } : b));

    try {
      if (bookId.startsWith('local-')) {
        const localBooks = JSON.parse(localStorage.getItem(storageKey) || '[]');
        const updatedBooks = localBooks.map((b: any) => b.id === bookId ? { ...b, groupId: groupId || undefined } : b);
        localStorage.setItem(storageKey, JSON.stringify(updatedBooks));
      } else if (db) {
        await updateDoc(doc(db, collectionName, bookId), {
          groupId: groupId || null
        });
      }
    } catch (err) {
      console.error("Failed to update group", err);
      await loadTextbooks(); // revert on failure
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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

      try {
        if (!db) throw new Error('Firebase not configured');
        const bookData: any = {
          name: file.name,
          url: publicUrl,
          fileId: `supabase-${fileId}`,
          createdAt: serverTimestamp()
        };
        if (type === 'material' && uid) {
          bookData.uid = uid;
        }
        await addDoc(collection(db, collectionName), bookData);
      } catch (dbErr) {
        console.warn("Firebase save failed, saving to localStorage:", dbErr);
        const newBook: any = {
          id: `local-${Date.now()}`,
          name: file.name,
          url: publicUrl,
          fileId: `supabase-${fileId}`,
          createdAt: Date.now()
        };
        if (type === 'material' && uid) {
          newBook.uid = uid;
        }
        const localBooks = JSON.parse(localStorage.getItem(storageKey) || '[]');
        localBooks.push(newBook);
        localStorage.setItem(storageKey, JSON.stringify(localBooks));
      }

      await loadTextbooks();
    } catch (err: any) {
      if (err.message === 'Failed to fetch') {
        setError(lang === 'zh' ? '网络请求失败。请检查您的网络连接。' : 'Network request failed. Please check your connection.');
      } else {
        setError(err.message);
      }
    } finally {
      setUploading(false);
    }
  };

  const handleAddUrl = async () => {
    if (!urlInput.trim() || !urlNameInput.trim()) {
      setError(lang === 'zh' ? '请填写名称和链接。' : 'Please provide both name and URL.');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      try {
        if (!db) throw new Error('Firebase not configured');
        await addDoc(collection(db, collectionName), {
          name: urlNameInput.trim() + (urlNameInput.toLowerCase().endsWith('.pdf') ? '' : '.pdf'),
          url: urlInput.trim(),
          fileId: 'url-' + Date.now(),
          createdAt: serverTimestamp()
        });
      } catch (dbErr) {
        console.warn("Firebase save failed, saving to localStorage:", dbErr);
        const newBook = {
          id: `local-${Date.now()}`,
          name: urlNameInput.trim() + (urlNameInput.toLowerCase().endsWith('.pdf') ? '' : '.pdf'),
          url: urlInput.trim(),
          fileId: 'url-' + Date.now(),
          createdAt: Date.now()
        };
        const localBooks = JSON.parse(localStorage.getItem(storageKey) || '[]');
        localBooks.push(newBook);
        localStorage.setItem(storageKey, JSON.stringify(localBooks));
      }

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
      
      if (book.id.startsWith('local-')) {
        const localBooks = JSON.parse(localStorage.getItem(storageKey) || '[]');
        const updatedBooks = localBooks.filter((b: any) => b.id !== book.id);
        localStorage.setItem(storageKey, JSON.stringify(updatedBooks));
      } else {
        if (db) {
          try {
            await deleteDoc(doc(db, collectionName, book.id));
          } catch (e) {
            console.warn("Firebase delete failed:", e);
          }
        }
        // Also try to remove from localStorage just in case it was an old local book without the prefix
        const localBooks = JSON.parse(localStorage.getItem(storageKey) || '[]');
        const updatedBooks = localBooks.filter((b: any) => b.id !== book.id);
        localStorage.setItem(storageKey, JSON.stringify(updatedBooks));
      }
      
      setTextbooks(textbooks.filter(b => b.id !== book.id));
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[80vh] liquid-panel-strong">
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Book className="w-5 h-5 text-white" />
            {title}
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
            {isAdmin && (
              <div className="flex items-center gap-2 mb-4 p-1 bg-white/5 rounded-lg w-fit">
                <button
                  onClick={() => setUploadMode('file')}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${uploadMode === 'file' ? 'bg-white text-black shadow-[0_0_15px_rgba(255,255,255,0.4)]' : 'text-zinc-400 hover:text-white'}`}
                >
                  <FileText className="w-4 h-4" />
                  {lang === 'zh' ? '本地上传' : 'Local File'}
                </button>
                <button
                  onClick={() => setUploadMode('url')}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${uploadMode === 'url' ? 'bg-white text-black shadow-[0_0_15px_rgba(255,255,255,0.4)]' : 'text-zinc-400 hover:text-white'}`}
                >
                  <LinkIcon className="w-4 h-4" />
                  {lang === 'zh' ? '链接导入 / Supabase 导入' : 'Import URL / Supabase'}
                </button>
              </div>
            )}

            {uploadMode === 'file' ? (
              <label className="flex items-center justify-center w-full p-8 border-2 border-dashed border-white/20 rounded-xl hover:border-white/50 hover:bg-white/5 transition-all cursor-pointer group liquid-panel">
                <div className="flex flex-col items-center gap-2 text-zinc-400 group-hover:text-white">
                  {uploading ? (
                    <Loader2 className="w-8 h-8 animate-spin" />
                  ) : (
                    <Upload className="w-8 h-8" />
                  )}
                  <span className="font-medium">
                    {uploading 
                      ? (lang === 'zh' ? '上传中...' : 'Uploading...') 
                      : (lang === 'zh' ? '点击上传 PDF (最大 50MB)' : 'Click to upload PDF (Max 50MB)')}
                  </span>
                  <span className="text-xs text-zinc-500 text-center mt-2">
                    {lang === 'zh' 
                      ? '如果文件超过 50MB，请直接在 Supabase 控制台上传，然后使用右侧的“链接导入”。' 
                      : 'If the file exceeds 50MB, upload it directly in the Supabase console and use "Import URL".'}
                  </span>
                </div>
                <input type="file" accept="application/pdf" className="hidden" onChange={handleUpload} disabled={uploading} />
              </label>
            ) : (
              <div className="space-y-4 p-5 border border-white/10 rounded-xl bg-white/5 liquid-panel">
                <div className="text-xs text-zinc-400 bg-zinc-900/50 p-3 rounded-lg border border-white/5 mb-2 liquid-panel">
                  {lang === 'zh' 
                    ? '你可以直接在 Supabase 控制台的 Storage 中上传超大文件。上传后点击文件，选择 "Get URL"，然后将链接粘贴到下方。' 
                    : 'You can upload large files directly in Supabase Storage console. Click the file, select "Get URL", and paste it below.'}
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">{lang === 'zh' ? '名称' : 'Name'}</label>
                  <input 
                    type="text" 
                    value={urlNameInput || ''}
                    onChange={e => setUrlNameInput(e.target.value)}
                    placeholder={lang === 'zh' ? '例如：高等数学上册' : 'e.g. Calculus Vol 1'}
                    className="w-full bg-zinc-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/50 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">{lang === 'zh' ? 'PDF 直链地址' : 'Direct PDF URL'}</label>
                  <input 
                    type="url" 
                    value={urlInput || ''}
                    onChange={e => setUrlInput(e.target.value)}
                    placeholder="https://example.com/book.pdf"
                    className="w-full bg-zinc-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/50 transition-colors"
                  />
                </div>
                <button 
                  onClick={handleAddUrl}
                  disabled={uploading || !urlInput.trim() || !urlNameInput.trim()}
                  className="w-full py-2 bg-white hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed text-black text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.4)] active:scale-95"
                >
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LinkIcon className="w-4 h-4" />}
                  {lang === 'zh' ? '添加链接' : 'Add URL'}
                </button>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
                {lang === 'zh' ? '已上传的文件' : 'Uploaded Files'}
              </h3>
              {isAdmin && (!isAddingGroup ? (
                <button 
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setIsAddingGroup(true);
                  }} 
                  className="text-xs flex items-center gap-1.5 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg text-white transition-all active:scale-95 shadow-lg border border-white/10"
                >
                  <Plus className="w-4 h-4" />
                  {lang === 'zh' ? '新建分组' : 'New Group'}
                </button>
              ) : (
                <div className="flex items-center gap-2 bg-zinc-800/50 p-1 rounded-lg border border-white/20 animate-in fade-in zoom-in duration-200">
                  <input
                    autoFocus
                    type="text"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleConfirmCreateGroup();
                      if (e.key === 'Escape') {
                        setIsAddingGroup(false);
                        setNewGroupName('');
                      }
                    }}
                    placeholder={lang === 'zh' ? '输入组名...' : 'Group name...'}
                    className="text-xs bg-transparent border-none rounded px-2 py-1 text-white focus:outline-none w-32 md:w-40"
                  />
                  <div className="flex items-center gap-1 pr-1">
                    <button 
                      type="button"
                      onClick={handleConfirmCreateGroup} 
                      className="p-1 text-emerald-400 hover:bg-emerald-400/20 rounded transition-colors"
                      title={lang === 'zh' ? '确定' : 'Confirm'}
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button 
                      type="button"
                      onClick={() => { setIsAddingGroup(false); setNewGroupName(''); }} 
                      className="p-1 text-zinc-500 hover:bg-white/10 rounded transition-colors"
                      title={lang === 'zh' ? '取消' : 'Cancel'}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 text-white animate-spin" />
              </div>
            ) : textbooks.length === 0 && groups.length === 0 ? (
              <div className="text-center py-8 text-zinc-500 text-sm">
                {emptyText}
              </div>
            ) : (
              <div className="space-y-6">
                {groups.map(group => (
                  <div 
                    key={group.id} 
                    className="bg-zinc-900/50 border border-white/10 rounded-xl p-4"
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, group.id)}
                  >
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <Folder className="w-4 h-4 text-blue-400" />
                        {group.name}
                      </h4>
                      {deleteConfirmId === group.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-zinc-500">{lang === 'zh' ? '确定删除?' : 'Delete?'}</span>
                          <button onClick={() => { handleDeleteGroup(group.id); setDeleteConfirmId(null); }} className="text-[10px] text-red-400 hover:underline">
                            {lang === 'zh' ? '是' : 'Yes'}
                          </button>
                          <button onClick={() => setDeleteConfirmId(null)} className="text-[10px] text-zinc-400 hover:underline">
                            {lang === 'zh' ? '否' : 'No'}
                          </button>
                        </div>
                      ) : (
                        isAdmin && (
                          <button onClick={() => setDeleteConfirmId(group.id)} className="text-zinc-500 hover:text-red-400 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )
                      )}
                    </div>
                    <div className="space-y-2 min-h-[40px]">
                      {textbooks.filter(b => b.groupId === group.id).map(book => (
                        <div 
                          key={book.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, book.id)}
                          className="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors cursor-grab active:cursor-grabbing liquid-panel"
                        >
                          <div className="flex items-center gap-3 overflow-hidden">
                            <Book className="w-4 h-4 text-zinc-400 shrink-0" />
                            <span className="text-sm font-medium text-zinc-200 truncate">{book.name}</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {isAdmin && (moveTargetId === book.id ? (
                              <div className="flex items-center gap-1 bg-zinc-800 rounded-lg p-1 border border-white/20 absolute right-10 z-10 shadow-xl">
                                <button
                                  onClick={() => handleMoveToGroup(book.id, null)}
                                  className="px-2 py-1 text-xs text-zinc-400 hover:text-white hover:bg-white/10 rounded transition-colors whitespace-nowrap"
                                >
                                  {lang === 'zh' ? '移出分组' : 'Ungroup'}
                                </button>
                                {groups.filter(g => g.id !== group.id).map(g => (
                                  <button
                                    key={g.id}
                                    onClick={() => handleMoveToGroup(book.id, g.id)}
                                    className="px-2 py-1 text-xs text-zinc-400 hover:text-white hover:bg-white/10 rounded transition-colors whitespace-nowrap max-w-[100px] truncate"
                                  >
                                    {g.name}
                                  </button>
                                ))}
                                <button
                                  onClick={() => setMoveTargetId(null)}
                                  className="p-1 text-zinc-500 hover:text-white hover:bg-white/10 rounded"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <button 
                                onClick={() => setMoveTargetId(book.id)}
                                className="p-1.5 text-zinc-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-md transition-colors"
                                title={lang === 'zh' ? '移动到...' : 'Move to...'}
                              >
                                <FolderInput className="w-4 h-4" />
                              </button>
                            ))}
                            {isAdmin && (
                              <button 
                                onClick={() => handleDelete(book)}
                                className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
                                title={lang === 'zh' ? '删除' : 'Delete'}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                      {textbooks.filter(b => b.groupId === group.id).length === 0 && (
                        <div className="text-xs text-zinc-500 italic text-center py-3 border border-dashed border-white/10 rounded-lg">
                          {lang === 'zh' ? '拖拽文件到这里' : 'Drag files here'}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                <div 
                  className="bg-zinc-900/30 border border-white/5 rounded-xl p-4"
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, null)}
                >
                  <h4 className="text-sm font-bold text-zinc-400 mb-3 flex items-center gap-2">
                    <Folder className="w-4 h-4 text-zinc-500" />
                    {lang === 'zh' ? '未分组' : 'Ungrouped'}
                  </h4>
                  <div className="space-y-2 min-h-[40px]">
                    {textbooks.filter(b => !b.groupId).map(book => (
                      <div 
                        key={book.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, book.id)}
                        className="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors cursor-grab active:cursor-grabbing liquid-panel"
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          <Book className="w-4 h-4 text-zinc-400 shrink-0" />
                          <span className="text-sm font-medium text-zinc-200 truncate">{book.name}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {isAdmin && (moveTargetId === book.id ? (
                            <div className="flex items-center gap-1 bg-zinc-800 rounded-lg p-1 border border-white/20 absolute right-10 z-10 shadow-xl flex-wrap max-w-[200px]">
                              {groups.map(g => (
                                <button
                                  key={g.id}
                                  onClick={() => handleMoveToGroup(book.id, g.id)}
                                  className="px-2 py-1 text-xs text-zinc-400 hover:text-white hover:bg-white/10 rounded transition-colors whitespace-nowrap max-w-[100px] truncate"
                                >
                                  {g.name}
                                </button>
                              ))}
                              <button
                                onClick={() => setMoveTargetId(null)}
                                className="p-1 text-zinc-500 hover:text-white hover:bg-white/10 rounded"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <button 
                              onClick={() => setMoveTargetId(book.id)}
                              className="p-1.5 text-zinc-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-md transition-colors"
                              title={lang === 'zh' ? '移动到...' : 'Move to...'}
                            >
                              <FolderInput className="w-4 h-4" />
                            </button>
                          ))}
                          {isAdmin && (
                            <button 
                              onClick={() => handleDelete(book)}
                              className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors shrink-0"
                              title={lang === 'zh' ? '删除' : 'Delete'}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {textbooks.filter(b => !b.groupId).length === 0 && (
                      <div className="text-xs text-zinc-500 italic text-center py-3 border border-dashed border-white/10 rounded-lg">
                        {lang === 'zh' ? '没有未分组的文件' : 'No ungrouped files'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
