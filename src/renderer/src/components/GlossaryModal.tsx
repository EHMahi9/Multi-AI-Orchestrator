import React, { useState, useMemo } from 'react';
import { SWE_GLOSSARY, type GlossaryTerm } from '../../../shared/glossary';

interface GlossaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTermId?: string | null;
}

export const GlossaryModal: React.FC<GlossaryModalProps> = ({ isOpen, onClose, initialTermId }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const categories = ['All', 'Security', 'Architecture', 'Quality & Testing', 'AI & Consensus'];

  const categoryLabels: Record<string, string> = {
    All: 'সবগুলো (All)',
    Security: 'নিরাপত্তা (Security)',
    Architecture: 'আর্কিটেকচার',
    'Quality & Testing': 'কোয়ালিটি ও টেস্ট',
    'AI & Consensus': 'AI সম্মতি',
  };

  const filteredTerms = useMemo(() => {
    return SWE_GLOSSARY.filter((item) => {
      const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
      if (!matchesCategory) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        item.term.toLowerCase().includes(q) ||
        item.banglaDef.toLowerCase().includes(q) ||
        item.realWorldAnalogy.toLowerCase().includes(q) ||
        item.englishDef.toLowerCase().includes(q)
      );
    });
  }, [searchQuery, selectedCategory]);

  const handleCopy = (item: GlossaryTerm) => {
    const text = `[বাস্তব উদাহরণ] ${item.term}:\n${item.realWorldAnalogy}\n\nসহজ ব্যাখ্যা: ${item.banglaDef}`;
    navigator.clipboard.writeText(text);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#0d1117',
          border: '1px solid #30363d',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '920px',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8), 0 0 30px rgba(56, 189, 248, 0.15)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid #21262d',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(90deg, #161b22 0%, #0d1117 100%)',
          }}
        >
          <div>
            <h3 style={{ margin: 0, color: '#f0f6fc', fontSize: '18px', fontWeight: 700 }}>
              SWE ও AI সহজ শব্দকোষ (Beginner Explainer Dictionary)
            </h3>
            <p style={{ margin: '2px 0 0', color: '#8b949e', fontSize: '12px' }}>
              জটিল কোডিং ও সাইবার-সিকিউরিটির টার্মগুলোর সহজ বাংলা ব্যাখ্যা ও বাস্তব জীবনের উদাহরণ
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#8b949e',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '6px 10px',
              borderRadius: '6px',
            }}
            title="বন্ধ করুন"
          >
            ✕
          </button>
        </div>

        {/* Search & Filter Bar */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #21262d', background: '#0a0d12' }}>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
            <input
              type="text"
              placeholder="টার্ম খুঁজুন... (e.g. timing, jwt, তালা, টোকেন, consensus)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #30363d',
                backgroundColor: '#161b22',
                color: '#f0f6fc',
                fontSize: '13px',
                outline: 'none',
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  background: '#21262d',
                  border: '1px solid #30363d',
                  color: '#c9d1d9',
                  borderRadius: '6px',
                  padding: '0 12px',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                ক্লিয়ার
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '20px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: selectedCategory === cat ? '1px solid #38bdf8' : '1px solid #30363d',
                  background: selectedCategory === cat ? 'rgba(56, 189, 248, 0.15)' : '#161b22',
                  color: selectedCategory === cat ? '#38bdf8' : '#8b949e',
                  transition: 'all 0.2s',
                }}
              >
                {categoryLabels[cat] || cat}
              </button>
            ))}
          </div>
        </div>

        {/* Terms List */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {filteredTerms.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#8b949e' }}>
              <p style={{ fontSize: '14px' }}>কোনো টার্ম খুঁজে পাওয়া যায়নি।</p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('All');
                }}
                style={{
                  marginTop: '8px',
                  background: '#21262d',
                  border: '1px solid #30363d',
                  color: '#58a6ff',
                  borderRadius: '6px',
                  padding: '6px 14px',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                সব শব্দ দেখুন
              </button>
            </div>
          ) : (
            filteredTerms.map((item) => (
              <div
                key={item.id}
                id={`term-${item.id}`}
                style={{
                  background: '#161b22',
                  border: initialTermId === item.id ? '2px solid #eab308' : '1px solid #30363d',
                  borderRadius: '10px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                {/* Term Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <h4 style={{ margin: 0, color: '#58a6ff', fontSize: '15px', fontWeight: 700 }}>
                      {item.term}
                    </h4>
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        background:
                          item.category === 'Security'
                            ? 'rgba(239, 68, 68, 0.15)'
                            : item.category === 'Quality & Testing'
                            ? 'rgba(34, 197, 94, 0.15)'
                            : item.category === 'AI & Consensus'
                            ? 'rgba(168, 85, 247, 0.15)'
                            : 'rgba(56, 189, 248, 0.15)',
                        color:
                          item.category === 'Security'
                            ? '#f87171'
                            : item.category === 'Quality & Testing'
                            ? '#4ade80'
                            : item.category === 'AI & Consensus'
                            ? '#c084fc'
                            : '#38bdf8',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                      }}
                    >
                      {item.category}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(item)}
                    style={{
                      background: '#21262d',
                      border: '1px solid #30363d',
                      color: copiedId === item.id ? '#4ade80' : '#8b949e',
                      borderRadius: '6px',
                      padding: '4px 10px',
                      fontSize: '11px',
                      cursor: 'pointer',
                    }}
                  >
                    {copiedId === item.id ? 'কপি হয়েছে' : 'কপি উদাহরণ'}
                  </button>
                </div>

                {/* Bangla Definition */}
                <div style={{ color: '#e6edf3', fontSize: '13px', lineHeight: '1.5' }}>
                  <strong style={{ color: '#7ee787' }}>সহজ বাংলায় ব্যাখ্যা: </strong>
                  {item.banglaDef}
                </div>

                {/* Real-World Analogy */}
                <div
                  style={{
                    background: 'rgba(234, 179, 8, 0.08)',
                    border: '1px solid rgba(234, 179, 8, 0.25)',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    color: '#facc15',
                    fontSize: '12px',
                    lineHeight: '1.5',
                  }}
                >
                  <strong>বাস্তব জীবনের উদাহরণ: </strong>
                  {item.realWorldAnalogy}
                </div>

                {/* Why It Matters */}
                <div style={{ color: '#8b949e', fontSize: '12px', lineHeight: '1.4' }}>
                  <strong style={{ color: '#cbd5e1' }}>কেন এটি দরকার: </strong>
                  {item.whyItMatters}
                </div>

                {/* English Definition */}
                <div style={{ color: '#6e7681', fontSize: '11px', borderTop: '1px solid #21262d', paddingTop: '6px' }}>
                  <strong>Tech Spec: </strong>
                  {item.englishDef}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '12px 24px',
            borderTop: '1px solid #21262d',
            background: '#161b22',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: '11px', color: '#8b949e' }}>
            মোট <strong>{SWE_GLOSSARY.length}</strong> টি টার্ম ইনডেক্স করা হয়েছে • SQAT Summit 2026 Accessibility Mode
          </span>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary"
            style={{ padding: '6px 16px', fontSize: '12px' }}
          >
            বন্ধ করুন (Close)
          </button>
        </div>
      </div>
    </div>
  );
};
