import React, { useEffect, useState } from 'react';
import { ArrowRight, LockKeyhole, Check, Eye } from 'lucide-react';
import { formatVND } from '../logic/gameEngine.js';
import { getBuildChoices } from '../logic/gamePresentation.js';
import Dialog from './Dialog.jsx';

export default function BuildDialog({ tile, player, prop, onConfirm, onSkip, onPreviewChange, busy }) {
  const choices = getBuildChoices(tile, player, prop);
  const [level, setLevel] = useState(() => choices.find(t => !t.locked)?.level || 1);
  const [previewOnly, setPreviewOnly] = useState(false);
  const selected = choices.find(t => t.level === level) || choices[0];
  const isNew = !prop?.owner;
  useEffect(() => {
    onPreviewChange(tile.type === 'property' && selected && !selected.locked ? { tileId: tile.id, tier: selected.level, color: player.color } : null);
  }, [tile.id, tile.type, selected?.level, selected?.locked, player.color, onPreviewChange]);
  useEffect(() => () => onPreviewChange(null), [onPreviewChange]);
  return <Dialog title={tile.name} eyebrow={previewOnly ? `Xem trước · ${selected?.title}` : isNew ? `${player.name} · Mua tài sản` : `${player.name} · Nâng công trình`} onClose={busy ? undefined : previewOnly ? () => setPreviewOnly(false) : onSkip} closeLabel={previewOnly ? 'Quay lại chọn cấp nhà' : 'Bỏ qua quyết định này'} className={`dialog-build ${previewOnly ? 'is-preview-only' : ''}`}>
    {!previewOnly && <>
    <div className="build-wallet"><span>Tiền hiện có</span><strong>{formatVND(player.money)}</strong></div>
    {tile.type === 'property' && <div className="build-intro"><span>Mỗi lần ghé chỉ xây một lần.</span><button className="text-button" onClick={() => setPreviewOnly(true)} disabled={selected?.locked}><Eye size={15} /> Xem trước trên bàn</button></div>}
    <div className={`build-choices ${tile.type !== 'property' ? 'is-single' : ''}`} role="group" aria-label="Chọn cấp công trình">
      {choices.map(choice => {
        const current = (prop?.houses || 0) >= choice.level;
        return <button key={choice.level} className={`build-choice ${choice.level === selected?.level ? 'is-selected' : ''}`} disabled={choice.locked || busy} aria-pressed={choice.level === selected?.level} onClick={() => setLevel(choice.level)}>
          <span className="build-choice-top"><span className="build-icon" aria-hidden="true">{choice.icon}</span><span className="build-tag">{choice.locked ? <LockKeyhole size={13} /> : choice.level === selected?.level ? <Check size={14} /> : `0${choice.level}`}</span></span>
          <strong>{choice.title}</strong>
          <span className="build-cost">{current ? 'Đã có' : choice.locked ? 'Chưa mở' : formatVND(choice.cost)}</span>
          {choice.rent !== null && <small>Thuê {formatVND(choice.rent)}</small>}
          {choice.locked && !current && <small className="build-lock-reason">{choice.level === 4 ? 'Cần có Biệt thự từ lần ghé trước.' : choice.reason}</small>}
        </button>;
      })}
    </div>
    {tile.type === 'railroad' && <p className="dialog-help">Sở hữu 1 / 2 / 3 / 4 ga thu 250k / 500k / 1 triệu / 2 triệu. Đủ 4 ga thắng ngay. Không xây nhà trên ga.</p>}
    {tile.type === 'utility' && <p className="dialog-help">Sở hữu một tiện ích thu 40k × tổng xúc xắc; cả hai tiện ích thu 100k × tổng xúc xắc. Không xây nhà trên tiện ích.</p>}
    </>}
    <div className="build-summary"><div><span>Tổng thanh toán</span><strong>{formatVND(selected?.cost || 0)}</strong></div><div><span>Số dư còn lại</span><strong className={player.money < selected?.cost ? 'is-negative' : ''}>{formatVND(player.money - (selected?.cost || 0))}</strong></div></div>
    {selected && !selected.can && <p className="dialog-warning" role="status">{selected.reason}</p>}
    <div className="dialog-actions"><button className="secondary-game-button" onClick={previewOnly ? () => setPreviewOnly(false) : onSkip} disabled={busy}>{previewOnly ? 'Chọn cấp khác' : 'Bỏ qua lần này'}</button><button className="primary-game-button" onClick={() => onConfirm(selected.level)} disabled={busy || !selected?.can}>{busy ? 'Đang xác nhận…' : isNew ? 'Xác nhận mua' : 'Xác nhận nâng cấp'}<ArrowRight size={16} /></button></div>
  </Dialog>;
}
