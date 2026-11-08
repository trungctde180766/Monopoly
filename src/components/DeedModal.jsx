import React from 'react';
import { formatVND } from '../logic/gameEngine.js';
import { getTileDetails } from '../logic/gamePresentation.js';
import Dialog from './Dialog.jsx';

export default function DeedModal({ tile, propertiesState = {}, players = [], dice = [1, 1], onClose }) {
  const info = getTileDetails(tile, propertiesState, players, dice);
  if (!info) return null;
  return <Dialog title={tile.type === 'free_parking' ? 'Lễ hội & Quỹ thưởng' : tile.name} eyebrow={info.typeLabel} onClose={onClose}>
    <div className="deed-status"><span style={{ background: info.owner?.color || info.group?.color || '#60748b' }} />{info.owner ? `Chủ sở hữu: ${info.owner.name}` : info.isAsset ? 'Chưa có chủ sở hữu' : info.typeLabel}<strong>{info.owner ? info.status : ''}</strong></div>
    {info.amount !== null && <div className="deed-current"><span>{info.priceLabel}</span><strong>{formatVND(info.amount)}</strong></div>}
    {info.rentRows.length > 0 && <table className="deed-table"><caption>Tiền thuê theo cấp công trình{info.prop?.isFestival ? ' · Lễ hội ×2' : ''}</caption><thead><tr><th scope="col">Công trình</th><th scope="col">Tiền thuê</th></tr></thead><tbody>{info.rentRows.map(row => <tr key={row.level} className={info.owner && row.level === (info.prop?.houses || 0) ? 'is-current' : ''}><th scope="row">{row.label}{info.owner && row.level === (info.prop?.houses || 0) && <small>Hiện tại</small>}</th><td>{formatVND(row.amount)}</td></tr>)}</tbody></table>}
    {tile.type === 'property' && <p className="dialog-help">Mua mới chọn cấp 1–3. Có Biệt thự từ trước lần ghé hiện tại mới được nâng Landmark. Mỗi lần ghé chỉ có một quyền mua/nâng. Đất trống đủ bộ màu thu gấp đôi mức cơ bản.</p>}
    {tile.type === 'railroad' && <p className="dialog-help">Tiền thuê 1 / 2 / 3 / 4 ga: 250k / 500k / 1 triệu / 2 triệu. Sở hữu đủ 4 ga thắng ngay.</p>}
    {tile.type === 'utility' && <p className="dialog-help">Một tiện ích: 40k × tổng hai xúc xắc. Cả hai tiện ích: 100k × tổng hai xúc xắc.</p>}
    {!info.isAsset && <p className="dialog-help">{info.description}</p>}
    {info.isAsset && <dl className="deed-facts"><div><dt>Giá đất</dt><dd>{formatVND(tile.price)}</dd></div>{tile.housePrice && <div><dt>Chi phí tăng một cấp</dt><dd>{formatVND(tile.housePrice)}</dd></div>}<div><dt>Thế chấp đất không có nhà</dt><dd>{formatVND(tile.mortgageValue)}</dd></div>{info.owner && <div><dt>Mua lại sau trả tiền thuê</dt><dd>{info.prop?.houses >= 4 ? 'Landmark không thể mua lại' : formatVND(info.buyoutPrice)}</dd></div>}</dl>}
    {info.prop?.isMortgaged && <p className="dialog-warning">Đang thế chấp: tiền thuê thực thu bằng 0.</p>}
    <div className="dialog-actions"><button className="primary-game-button" onClick={onClose}>Đã hiểu</button></div>
  </Dialog>;
}
