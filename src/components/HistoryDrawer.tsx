import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Clock, Trash2, Image as ImageIcon, ChevronRight, Loader2, LineChart } from 'lucide-react';

interface HistoryRecord {
  id: number;
  module: string;
  summary: string;
  content: string;
  image_url: string | null;
  created_at: string;
}

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  lang: 'zh' | 'en';
  onSelectRecord?: (record: HistoryRecord) => void;
  uid?: string | null;
}

export function HistoryDrawer({ isOpen, onClose, lang, onSelectRecord, uid }: HistoryDrawerProps) {
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletePeriod, setDeletePeriod] = useState<'1day' | '3days' | '7days' | '30days' | '90days' | 'all'>('all');

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const fetchHistory = async () => {
    if (!uid) {
      setRecords([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/records?uid=${encodeURIComponent(uid)}`);
      if (res.ok) {
        const data = await res.json();
        setRecords(data);
      }
    } catch (error) {
      console.error('Failed to fetch history:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
    }
  }, [isOpen]);

  const handleDelete = async () => {
    if (!uid) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/records?period=${deletePeriod}&uid=${encodeURIComponent(uid)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchHistory();
        setShowDeleteConfirm(false);
      }
    } catch (error) {
      console.error('Failed to delete history:', error);
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200]"
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-zinc-950 border-l border-white/10 z-[201] flex flex-col shadow-2xl"
          >
            <div className="flex items-center justify-between p-4 border-b border-white/10 bg-zinc-900/50">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-zinc-400" />
                <h2 className="text-lg font-semibold text-white">
                  {lang === 'zh' ? '历史记录' : 'History'}
                </h2>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 border-b border-white/10 bg-zinc-900/30 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-zinc-500 font-medium uppercase tracking-wider">
                  {lang === 'zh' ? '批量清理' : 'Batch Cleanup'}
                </span>
                <span className="text-[10px] text-zinc-600">
                  {lang === 'zh' ? '删除指定时间之前的记录' : 'Delete records older than selected period'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={deletePeriod}
                  onChange={(e) => setDeletePeriod(e.target.value as any)}
                  className="flex-1 bg-zinc-900 border border-white/10 text-zinc-300 text-sm rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-white transition-all"
                >
                  <option value="1day">{lang === 'zh' ? '1天前 (24小时以上)' : 'Older than 1 day'}</option>
                  <option value="3days">{lang === 'zh' ? '3天前' : 'Older than 3 days'}</option>
                  <option value="7days">{lang === 'zh' ? '7天前' : 'Older than 7 days'}</option>
                  <option value="30days">{lang === 'zh' ? '30天前' : 'Older than 30 days'}</option>
                  <option value="90days">{lang === 'zh' ? '90天前' : 'Older than 90 days'}</option>
                  <option value="all">{lang === 'zh' ? '所有记录' : 'All records'}</option>
                </select>
                {showDeleteConfirm ? (
                  <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    <span className="text-xs text-red-400 font-medium">{lang === 'zh' ? '确定?' : 'Sure?'}</span>
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="text-xs text-red-400 hover:underline font-bold"
                    >
                      {lang === 'zh' ? '是' : 'Yes'}
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="text-xs text-zinc-400 hover:underline"
                    >
                      {lang === 'zh' ? '否' : 'No'}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={deleting || records.length === 0}
                    className="flex items-center gap-1.5 px-4 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    {lang === 'zh' ? '清理' : 'Clean'}
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
                </div>
              ) : records.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-zinc-500">
                  <Clock className="w-12 h-12 mb-4 opacity-20" />
                  <p>{lang === 'zh' ? '暂无历史记录' : 'No history records found'}</p>
                </div>
              ) : (
                records.map((record) => (
                  <div
                    key={record.id}
                    onClick={() => onSelectRecord && onSelectRecord(record)}
                    className="group bg-zinc-900/50 border border-white/5 hover:border-white/20 rounded-xl p-3 cursor-pointer transition-all hover:bg-zinc-800/50"
                  >
                    <div className="flex items-start gap-3">
                      {record.image_url ? (
                        <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 border border-white/10 bg-zinc-950">
                          <img src={record.image_url} alt="thumbnail" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-16 h-16 rounded-lg shrink-0 border border-white/10 bg-zinc-900 flex items-center justify-center">
                          {record.module === 'grapher' ? (
                            <LineChart className="w-6 h-6 text-emerald-500/50" />
                          ) : (
                            <ImageIcon className="w-6 h-6 text-zinc-600" />
                          )}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/10 text-zinc-300">
                            {record.module}
                          </span>
                          <span className="text-[10px] text-zinc-500">
                            {formatDate(record.created_at)}
                          </span>
                        </div>
                        <p className="text-sm text-zinc-200 line-clamp-2 leading-snug">
                          {record.summary}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-white transition-colors self-center shrink-0" />
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
