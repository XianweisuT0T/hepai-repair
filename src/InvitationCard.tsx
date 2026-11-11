import { useRef, useState } from 'react';
import QRCode from 'qrcode';
import emblem from './assets/hepai-emblem-v2.png';

function loadImage(src:string):Promise<HTMLImageElement>{return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('桌牌图片暂时没有载入，请再试一次。'));image.src=src;});}

/** A printable card bound to the actual room and selected reachable invitation origin. */
export default function InvitationCard({roomCode,inviteLink,canScan,onError}:{roomCode:string;inviteLink:string;canScan:boolean;onError:(message:string)=>void}){
  const [picture,setPicture]=useState(''),[busy,setBusy]=useState(false);
  const modal=useRef<HTMLDialogElement>(null);
  async function prepare(){
    if(busy||!canScan)return;
    setBusy(true);
    try{
      await document.fonts.ready;
      const [logo,qr]=await Promise.all([loadImage(emblem),QRCode.toDataURL(inviteLink,{width:500,margin:4,errorCorrectionLevel:'M',color:{dark:'#243e36',light:'#ffffff'}}).then(loadImage)]);
      const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=1800;
      const c=canvas.getContext('2d');if(!c)throw new Error('浏览器暂时不能生成桌牌。');
      c.fillStyle='#efe6cf';c.fillRect(0,0,1200,1800);
      c.strokeStyle='#bda777';c.lineWidth=2;c.strokeRect(42,42,1116,1716);c.strokeRect(55,55,1090,1690);
      c.fillStyle='#1c3538';c.fillRect(56,56,1088,385);
      c.globalAlpha=.08;c.drawImage(logo,665,75,390,390);c.globalAlpha=1;c.drawImage(logo,92,112,103,103);
      c.textAlign='left';c.fillStyle='#f1e8cd';c.font='46px "SimSun",serif';c.fillText('合拍修理铺',218,159);
      c.font='19px Georgia,serif';c.fillStyle='#d7bf87';c.fillText('HEPAI REPAIR',220,195);
      c.font='53px "SimSun",serif';c.fillStyle='#f0e8d3';c.fillText('先一起修好一段旋律。',100,322);
      c.fillStyle='#304c3e';c.textAlign='center';c.font='32px "SimSun",serif';c.fillText('两个初次见面的人，也能从一件小事开始。',600,520);
      c.drawImage(qr,350,590,500,500);
      c.font='22px "Microsoft YaHei",sans-serif';c.fillStyle='#617051';c.fillText('请用另一台设备扫码，加入伙伴的工位',600,1145);
      c.strokeStyle='#b9aa80';c.beginPath();c.moveTo(160,1200);c.lineTo(1040,1200);c.stroke();
      c.fillStyle='#486047';c.font='24px "SimSun",serif';c.fillText('你的工位码',600,1270);
      c.font='68px Georgia,serif';c.fillStyle='#29483b';c.fillText(roomCode,600,1355);
      c.font='28px "SimSun",serif';c.fillText('一人看图纸，一人装零件，中途交换。',600,1455);
      c.font='25px "SimSun",serif';c.fillText('听见彼此的选择，留下一只共同的音乐盒。',600,1510);
      const origin=new URL(inviteLink).origin;
      c.fillStyle='#657052';c.font='20px "Microsoft YaHei",sans-serif';c.fillText(origin,600,1630);
      const local=['localhost','127.0.0.1'].includes(new URL(inviteLink).hostname)||/^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(new URL(inviteLink).hostname);
      c.font='19px "SimSun",serif';c.fillText(local?'请连接同一局域网；工位有效期以页面提示为准。':'扫码进入网页；工位有效期以页面提示为准。',600,1673);
      setPicture(canvas.toDataURL('image/png'));modal.current?.showModal();
    }catch(error){onError(error instanceof Error?error.message:'桌牌暂时没有生成，请再试一次。');}
    finally{setBusy(false);}
  }
  function download(){const link=document.createElement('a');link.href=picture;link.download=`合拍修理铺_工位${roomCode}_扫码桌牌.png`;link.click();}
  return <div className="invitation-card-export" data-invite-link={inviteLink} data-room-code={roomCode}>
    <button className="text-link" data-testid="invitation-card-open" disabled={!canScan||busy} onClick={()=>void prepare()}>{busy?'正在排好桌牌…':'生成这间工位的扫码桌牌'} <span aria-hidden="true">↗</span></button>
    {!canScan&&<small>先选择可供伙伴访问的邀请地址，再生成扫码桌牌。</small>}
    <dialog className="invitation-card-dialog" ref={modal} aria-labelledby="invitation-card-title">
      <div className="invitation-card-preview"><h2 id="invitation-card-title">放在桌上，一起开始</h2>{picture&&<img data-testid="invitation-card-image" src={picture} alt={`合拍修理铺工位${roomCode}的真实扫码桌牌`}/>}<div><button className="secondary" onClick={()=>modal.current?.close()}>收起预览</button><button className="primary" data-testid="invitation-card-download" onClick={download}>保存打印图片 <span aria-hidden="true">↓</span></button></div><p>图片为 1200 × 1800 像素，可打印为 A6 尺寸。二维码对应当前工位。</p></div>
    </dialog>
  </div>;
}
