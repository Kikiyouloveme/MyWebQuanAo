export type Side = 'front' | 'back';
export type Position = 'FRONT'|'BACK'|'LEFT_CHEST';
export const POSITIONS:Position[]=['FRONT','BACK','LEFT_CHEST'];
export const POSITION_LABEL:Record<Position,string>={FRONT:'Mặt trước',BACK:'Mặt sau',LEFT_CHEST:'Ngực trái'};
export const positionSide=(p:Position):Side=>p==='BACK'?'back':'front';
export interface PrintArea { enabled:boolean; x:number;y:number;width:number;height:number;widthMM:number;heightMM:number;fee:number }
export interface PrintSettings { workflowMode?:'srs'|'enhanced';supportedFonts?:string[];supportedColors?:string[];positions?:Record<Position,PrintArea&{textRate:number;imageRate:number;maxChars:number}>; id:string;productId:string;version:number;enabled:boolean;technique:string;exportDpi?:number;minDpi:number;recommendedDpi:number;maxBytes:number;formats:string[];areas:Record<Side,PrintArea>;mockups:Record<string,Record<Side,string>> }
export interface DesignLayer { fontSize?:number; position?:Position; id:string;type:'text'|'image';x:number;y:number;width:number;height:number;rotation:number;text?:string;font?:string;color?:string;assetId?:string;dpi?:number }
export interface DesignSnapshot { productId:string;variantId:string;color:string;size:string;layers:Record<Side,DesignLayer[]>;settings:PrintSettings }
export interface DesignRevision { previewUrl?:string;id:string;version:number;snapshot:DesignSnapshot;hash:string }
export interface Design { id:string;title:string;productId:string;variantId:string;currentVersion:number;revisionId:string;updatedAt:string;revision:DesignRevision }
export interface PrintJob { reviewAgeHours?:number;reviewOverdue?:boolean; workflowMode?:string;reviewRequestedAt?:string;freeRevisionUsed?:boolean; id:string;orderId:string;orderLineId:string;designId:string;designRevisionId:string;status:string;snapshot:DesignSnapshot;settings:PrintSettings;productionStartedAt?:string;proof?:{id:string;hash:string;snapshot:DesignSnapshot;exports?:Partial<Record<Side|'left_chest',{width:number;height:number;dpi:number}>>};history:{status:string;at:string;note:string}[] }
export interface SizeChart { version:number;fit:string;sample:boolean;rows:{size:string;chest:number;length:number}[] }
export function areaFor(snapshot:DesignSnapshot,layer:DesignLayer,side:Side){return snapshot.settings.workflowMode==='srs'?snapshot.settings.positions![(layer.position||side.toUpperCase()) as Position]:snapshot.settings.areas[side];}
export const PRINT_LABEL:Record<string,string>={AWAITING_REVIEW:'Awaiting review',APPROVED:'Approved',DONE:'Done',WAITING_PAYMENT:'Chờ thanh toán / xác nhận COD',WAITING_STAFF_REVIEW:'Chờ nhân viên duyệt',REVISION_REQUIRED:'Cần chỉnh sửa',REJECTED:'Thiết kế bị từ chối',WAITING_CUSTOMER_APPROVAL:'Chờ bạn xác nhận mẫu',QUEUED:'Đã xếp lịch',PRINTING:'Đang in',QUALITY_CHECK:'Kiểm tra chất lượng',QC_FAILED:'Cần in lại',PACKED:'Đã đóng gói',CANCELLED:'Đã hủy'};

Object.assign(PRINT_LABEL,{AWAITING_REVIEW:"Chờ duyệt thiết kế",APPROVED:"Đã duyệt thiết kế",DONE:"Hoàn tất in"});
