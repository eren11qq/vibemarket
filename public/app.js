// ===== 键盘导航 (Escape关闭弹窗) =====
document.addEventListener('keydown',function(e){
  if(e.key==='Escape'){
    var ov=document.getElementById('loginOverlay');
    if(ov&&ov.style.display!=='none'){closeLogin();return}
    var ov2=document.getElementById('buyOverlay');
    if(ov2&&ov2.style.display!=='none'){ov2.style.display='none';return}
    var ov3=document.getElementById('detailOverlay');
    if(ov3&&ov3.style.display!=='none'){ov3.style.display='none';return}
  }
});

// ===== 安全工具: HTML 转义 (防止 XSS) =====
function escapeHtml(str) {
  if (!str) return '';
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
// 安全地设置元素文本内容 (替代 innerHTML)
function safeText(el, text) {
  if (el) el.textContent = text || '';
}

// ===== API 层 =====
var API = (function(){
  var BASE = '';
  function token(){ return localStorage.getItem('vibe_token') }
  async function get(path){
    var h={};
    if(token()) h['Authorization']='Bearer '+token();
    var r=await fetch(BASE+path,{headers:h});
    if(!r.ok) throw new Error(await r.text());
    return r.json();
  }
  async function post(path,body){
    var h={'Content-Type':'application/json'};
    if(token()) h['Authorization']='Bearer '+token();
    var r=await fetch(BASE+path,{method:'POST',headers:h,body:JSON.stringify(body)});
    var d=await r.json();
    if(!r.ok) throw new Error(d.error||'请求失败');
    return d;
  }
  async function patch(path,body){
    var h={'Content-Type':'application/json'};
    if(token()) h['Authorization']='Bearer '+token();
    var r=await fetch(BASE+path,{method:'PATCH',headers:h,body:JSON.stringify(body)});
    var d=await r.json();
    if(!r.ok) throw new Error(d.error||'操作失败');
    return d;
  }
  async function del(path){
    var h={};
    if(token()) h['Authorization']='Bearer '+token();
    var r=await fetch(BASE+path,{method:'DELETE',headers:h});
    var d=await r.json();
    if(!r.ok) throw new Error(d.error||'操作失败');
    return d;
  }
  return {get:get,post:post,patch:patch,del:del,token:token,
    isLoggedIn:function(){return !!token()},
    isAdmin:function(){return localStorage.getItem('vibe_isAdmin')==='true'},
    username:function(){return localStorage.getItem('vibe_username')||''},
    login:async function(u,p){var d=await post('/api/auth/login',{username:u,password:p});localStorage.setItem('vibe_token',d.token);localStorage.setItem('vibe_username',d.user.username);localStorage.setItem('vibe_displayName',d.user.displayName);localStorage.setItem('vibe_userId',d.user.id);localStorage.setItem('vibe_isAdmin',String(d.isAdmin||false));return d},
    register:async function(u,p,n,e){var d=await post('/api/auth/register',{username:u,password:p,displayName:n||u,email:e||''});localStorage.setItem('vibe_token',d.token);localStorage.setItem('vibe_username',d.user.username);localStorage.setItem('vibe_displayName',d.user.displayName);localStorage.setItem('vibe_userId',d.user.id);localStorage.setItem('vibe_isAdmin','false');return d},
    logout:function(){localStorage.removeItem('vibe_token');localStorage.removeItem('vibe_username');localStorage.removeItem('vibe_displayName');localStorage.removeItem('vibe_userId');localStorage.removeItem('vibe_isAdmin')}
  };
})();
// ===== 加载状态工具 =====
function showLoading(msg){
  var el=document.getElementById('globalLoading');
  if(!el){
    el=document.createElement('div');
    el.id='globalLoading';
    el.className='global-loading';
    el.innerHTML='<div style="text-align:center"><div class="loading-spinner"></div><div style="margin-top:16px;font-size:14px;color:#666;font-family:\'Inter\',sans-serif">'+(msg||'加载中...')+'</div></div>';
    document.body.appendChild(el);
  }else{
    el.style.display='flex';
    el.querySelector('div div:last-child').textContent=msg||'加载中...';
  }
}
function hideLoading(){
  var el=document.getElementById('globalLoading');
  if(el)el.style.display='none';
}
// ===== Toast 通知系统 (DS 动效) =====
function showToast(msg, type){
  type=type||'info';
  var colorMap={success:'#CFFF55',error:'#FF4444',info:'#cccccc'};
  var borderColor=colorMap[type]||'#cccccc';
  // 移除已存在的 toast
  var existing=document.querySelector('.ds-toast');
  if(existing)existing.remove();
  var el=document.createElement('div');
  el.className='ds-toast';
  el.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(60px);z-index:99999;background:#fff;border-left:4px solid '+borderColor+';border-radius:14px;padding:14px 24px;font-size:14px;font-weight:500;font-family:\'Inter\',sans-serif;color:#1a1a1a;box-shadow:0 8px 32px rgba(0,0,0,.12),0 2px 8px rgba(0,0,0,.08);opacity:0;transition:none;pointer-events:none;max-width:360px;text-align:center;line-height:1.4';
  el.textContent=msg;
  document.body.appendChild(el);
  // 滑入
  requestAnimationFrame(function(){
    el.style.transition='transform 0.5s var(--ease-out-cubic), opacity 0.5s var(--ease-out-cubic)';
    el.style.transform='translateX(-50%) translateY(0)';
    el.style.opacity='1';
  });
  // 3秒后滑出
  setTimeout(function(){
    el.style.transition='opacity 0.3s ease';
    el.style.opacity='0';
    setTimeout(function(){if(el.parentNode)el.remove()},300);
  },3000);
}
// ===== 审核通知系统 =====
function checkNotifications(){
  if(!API.isLoggedIn()||!MY_WORKS_DATA||!MY_WORKS_DATA.length)return;
  // 读取 localStorage 中保存的上次审核状态
  var prevApprovals=JSON.parse(localStorage.getItem('sprout_prev_approvals')||'{}');
  // 读取已通知过的作品ID列表
  var notified=JSON.parse(localStorage.getItem('sprout_notified_ids')||'[]');
  var hasNew=false;
  MY_WORKS_DATA.forEach(function(w){
    var currentApproved=(w.status==='published');
    // 已通知过的作品不再重复通知
    if(notified.indexOf(w.id)!==-1){
      prevApprovals[w.id]=currentApproved;
      return;
    }
    var prev=prevApprovals[w.id];
    // 状态从 false/undefined 变为 true → 审核通过
    if(!prev&&currentApproved){
      showToast('🎉 作品「'+w.title+'」已审核通过！','success');
      notified.push(w.id);
      hasNew=true;
    }
    // 状态从 true 变为 false → 审核拒绝
    else if(prev===true&&!currentApproved){
      showToast('❌ 作品「'+w.title+'」已被拒绝','error');
      notified.push(w.id);
      hasNew=true;
    }
    prevApprovals[w.id]=currentApproved;
  });
  localStorage.setItem('sprout_prev_approvals',JSON.stringify(prevApprovals));
  if(hasNew)localStorage.setItem('sprout_notified_ids',JSON.stringify(notified));
}
// ===== FAQ 手风琴切换 =====
function toggleFaq(el){
  el.classList.toggle('open');
}
function selectTab(btn,target){
  document.querySelectorAll('.nav-tab').forEach(function(t){t.classList.remove('active')});
  btn.classList.add('active');
  // 隐藏所有页面
  var allPages=[document.querySelector('main .hero'),document.querySelector('.weekly-section'),document.querySelector('.works-section'),document.querySelector('.pricing-section'),document.querySelector('.work-detail-section'),document.querySelector('.creator-section'),document.querySelector('.feedback-section'),document.querySelector('.letter-section'),document.querySelector('.creator-works-section'),document.querySelector('.upload-section'),document.querySelector('.faq-section'),document.querySelector('.privacy-section'),document.querySelector('.notfound-section'),document.querySelector('.admin-section')];
  allPages.forEach(function(p){if(p)p.classList.remove('active')});
  // 显示目标页面
  if(!target||target==='/'){
    var hero=document.querySelector('main .hero');if(hero)hero.classList.add('active');
    document.body.style.overflow='hidden'
  }else{
    var m={'/weekly-best':'.weekly-section','/works':'.works-section','/pricing':'.pricing-section','/creators':'.creator-section','/help':'.faq-section','/privacy':'.privacy-section','/feedback':'.feedback-section','/my-works':'.creator-works-section','/upload':'.upload-section','/admin':'.admin-section'};
    var s=m[target];if(s){var e=document.querySelector(s);if(e)e.classList.add('active')}
    // 我的作品页启用 DS 暗色模式
    if(target==='/my-works'){
      document.body.classList.add('ds-dark');
      checkNotifications();
    }else{
      document.body.classList.remove('ds-dark');
    }
    // 作品列表 / 定价 / 创作者可滚动，其余锁定
    document.body.style.overflow=(target==='/works'||target==='/pricing'||target==='/creators'||target==='/upload'||target==='/help'||target==='/privacy'||target==='/admin')?'auto':'hidden'
  }
}
// ===== 上传作品处理 =====
async function handleUpload(e){
  e.preventDefault();
  var msg=document.getElementById('upMsg');
  if(!API.isLoggedIn()){
    msg.className='up-msg error';
    msg.textContent='请先登录';
    return false;
  }
  var title=document.getElementById('upTitle').value.trim();
  if(!title){
    msg.className='up-msg error';
    msg.textContent='请输入作品标题';
    return false;
  }
  var desc=document.getElementById('upDesc').value.trim();
  var category=document.getElementById('upCategory').value;
  var price=document.getElementById('upPrice').value.trim();
  var fileInput=document.getElementById('upFile');
  var file=fileInput.files[0];
  var xianyuUrl=document.getElementById('upXianyu').value.trim();
  var tagsRaw=document.getElementById('upTags').value.trim();
  var tags=tagsRaw?tagsRaw.split(',').map(function(t){return t.trim()}).filter(function(t){return t}):[];
  // 读取文件为 base64 Data URL
  var mediaUrl='';
  function doSubmit(url){
    var body={
      title:title,
      description:desc||'',
      category:category,
      mediaType:url?(url.indexOf('video/')!==-1||url.indexOf('data:video')===0?'video':'image'):'',
      mediaUrl:url||'',
      price:price?parseFloat(price):0,
      xianyuUrl:xianyuUrl||'',
      tags:tags,
      creatorId:localStorage.getItem('vibe_userId')||''
    };
    fetch('/api/works',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+(localStorage.getItem('vibe_token')||'')},
      body:JSON.stringify(body)
    }).then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.error||'发布失败');return d})})
    .then(function(){
      msg.className='up-msg success';
      msg.textContent='发布成功';
      document.getElementById('upForm').reset();
      // 清空文件预览和 input
      document.getElementById('upFilePreview').classList.remove('show');
      document.getElementById('upPreviewImg').src='';
      document.getElementById('upFileName').textContent='';
      fileInput.value='';
      var zone=document.getElementById('upFileZone');
      if(zone)zone.style.display='';
      if(typeof loadWorks==='function') loadWorks();
      if(typeof loadWeekly==='function') loadWeekly();
    }).catch(function(e){
      msg.className='up-msg error';
      msg.textContent=e.message||'发布失败，请稍后重试';
    });
  }
  if(file){
    var reader=new FileReader();
    reader.onload=function(e){
      doSubmit(e.target.result);
    };
    reader.onerror=function(){
      msg.className='up-msg error';
      msg.textContent='文件读取失败，请重试';
    };
    reader.readAsDataURL(file);
  }else{
    doSubmit(''); // 使用默认占位图（后端处理 /placeholder.svg）
  }
  return false;
}
// ===== 文件上传预览 + 拖拽支持 =====
(function(){
  var zone=document.getElementById('upFileZone');
  var input=document.getElementById('upFile');
  var preview=document.getElementById('upFilePreview');
  var previewImg=document.getElementById('upPreviewImg');
  var fileName=document.getElementById('upFileName');
  if(!zone||!input)return;
  // 选中文件 → 预览
  input.addEventListener('change',function(){
    var f=this.files[0];
    if(!f){preview.classList.remove('show');zone.style.display='';return}
    fileName.textContent=f.name;
    // 判断文件类型
    if(f.type.startsWith('video/')){
      previewImg.outerHTML='<video id="upPreviewImg" controls style="max-height:120px;border-radius:8px;object-fit:cover"></video>';
      var vid=document.getElementById('upPreviewImg');
      vid.src=URL.createObjectURL(f);
    }else{
      if(previewImg.tagName!=='IMG'){
        previewImg.outerHTML='<img id="upPreviewImg" src="" alt="预览" style="max-height:120px;border-radius:8px;object-fit:cover">';
      }
      var img=document.getElementById('upPreviewImg');
      img.src=URL.createObjectURL(f);
    }
    preview.classList.add('show');
    zone.style.display='none';
  });
  // 移除已上传文件
  function removeUploadedFile(){
    var fileInput=document.getElementById('upFile');
    var preview=document.getElementById('upFilePreview');
    var zone=document.getElementById('upFileZone');
    if(fileInput)fileInput.value='';
    if(preview)preview.classList.remove('show');
    if(zone)zone.style.display='';
    // 清理视频元素的 object URL
    var previewImg=document.getElementById('upPreviewImg');
    if(previewImg&&previewImg.tagName==='VIDEO'){
      URL.revokeObjectURL(previewImg.src);
      previewImg.outerHTML='<img id="upPreviewImg" src="" alt="预览" style="max-height:120px;border-radius:8px;object-fit:cover">';
    }
  }
  window.removeUploadedFile=removeUploadedFile;
  // 拖拽事件
  zone.addEventListener('dragover',function(e){
    e.preventDefault();e.stopPropagation();
    zone.classList.add('dragover');
  });
  zone.addEventListener('dragleave',function(e){
    e.preventDefault();e.stopPropagation();
    zone.classList.remove('dragover');
  });
  zone.addEventListener('drop',function(e){
    e.preventDefault();e.stopPropagation();
    zone.classList.remove('dragover');
    if(e.dataTransfer.files.length){
      input.files=e.dataTransfer.files;
      input.dispatchEvent(new Event('change'));
    }
  });
})();
// 跳转到上传页面（完全自包含实现，不依赖 selectTab 链）
function goToUpload(){
  // 1. 移除所有导航标签的 active 状态
  document.querySelectorAll('.nav-tab').forEach(function(t){t.classList.remove('active')});
  // 2. 激活上传导航标签
  var uploadTab=document.querySelector('.nav-tab[onclick*="/upload"]');
  if(uploadTab)uploadTab.classList.add('active');
  // 3. 隐藏所有页面
  var allPages='.hero,.weekly-section,.works-section,.pricing-section,.work-detail-section,.creator-section,.feedback-section,.letter-section,.creator-works-section,.upload-section,.faq-section,.privacy-section,.notfound-section,.admin-section';
  document.querySelectorAll(allPages).forEach(function(p){p.classList.remove('active')});
  // 4. 显示上传页面
  var uploadSection=document.querySelector('.upload-section');
  if(uploadSection)uploadSection.classList.add('active');
  // 5. 设置滚动 & 暗色模式
  document.body.style.overflow='auto';
  document.body.classList.remove('ds-dark');
}
window.goToUpload=goToUpload;
// 直接绑定按钮事件（绕过内联 onclick 的所有潜在问题）
(function(){
  var pricingBtn=document.querySelector('.pfc-action');
  if(pricingBtn)pricingBtn.addEventListener('click',function(e){e.preventDefault();goToUpload();});
  var heroBtn=document.querySelector('.hero-cta');
  if(heroBtn)heroBtn.addEventListener('click',function(e){e.preventDefault();goToUpload();});
})();
// ===== 创作者列表加载 =====
var CREATOR_DATA=[];
var CREATOR_GRADIENT=[
  'linear-gradient(135deg,#1a1a2e,#16213e)',
  'linear-gradient(135deg,#7D5BA6,#5A3D82)',
  'linear-gradient(135deg,#4A9E6E,#2D7A52)',
  'linear-gradient(135deg,#C75B5B,#A04040)',
  'linear-gradient(135deg,#4A7DB4,#2C5F8A)',
  'linear-gradient(135deg,#B87A4A,#8F5D34)',
  'linear-gradient(135deg,#D946EF,#86198F)',
  'linear-gradient(135deg,#06B6D4,#0E7490)',
  'linear-gradient(135deg,#F59E0B,#B45309)',
];
var CREATOR_FALLBACK=[
  {id:'c1',name:'马努·阿罗拉',role:'全栈设计师 · UI 动效 · 设计系统',works:42,followers:'1.2k',likes:'8.9k',desc:'专注于UI动效与设计系统的构建。相信好的设计不是堆砌，而是在每个细节上都做到恰到好处。'},
  {id:'c2',name:'林小薇',role:'产品设计师 · 交互 · 用户研究',works:38,followers:'2.3k',likes:'15k',desc:'产品设计师出身，深耕交互设计多年。热衷于用设计思维解决复杂问题，让产品既有温度又有逻辑。'},
  {id:'c3',name:'Jason Chen',role:'创意技术专家 · WebGL · 交互艺术',works:27,followers:'856',likes:'6.2k',desc:'创意技术专家，用WebGL与交互艺术打破数字边界。在代码中寻找美学，在像素中探索可能。'},
  {id:'c4',name:'Sarah Kim',role:'品牌设计师 · 视觉识别 · 设计语言',works:55,followers:'3.1k',likes:'22k',desc:'品牌视觉识别的造梦者。相信每个品牌都值得独特的设计语言，简约中蕴藏力量。'},
  {id:'c5',name:'David Wang',role:'前端工程师 · 简约 · 高效设计',works:19,followers:'634',likes:'4.1k',desc:'前端出身的设计师，追求极致的简约与高效。认为最好的交互是让人感受不到设计的存在。'},
  {id:'c6',name:'Rachel Green',role:'设计系统架构师 · 组件化设计体系',works:63,followers:'4.5k',likes:'31k',desc:'设计系统架构师，专注于组件化设计体系的构建与规模化落地。让设计从无序走向有序。'},
];
function renderCreators(list){
  var grid=document.getElementById('creatorGrid');
  if(!grid)return;
  grid.innerHTML='';
  list.forEach(function(c,i){
    var card=document.createElement('div');card.className='creator-card';
    var init=c.name.charAt(0).toUpperCase();
    var grad=CREATOR_GRADIENT[i%CREATOR_GRADIENT.length];
    card.innerHTML=
      '<div class="cc-avatar" style="background:'+grad+'">'+init+'</div>'+
      '<div class="cc-name">'+escapeHtml(c.name)+'</div>'+
      '<div class="cc-role">'+escapeHtml(c.role)+'</div>'+
      '<div class="cc-stats-row">'+
        '<div class="cc-stat-item"><div class="cc-stat-num">'+c.works+'</div><div class="cc-stat-label">作品</div></div>'+
        '<div class="cc-stat-item"><div class="cc-stat-num">'+c.followers+'</div><div class="cc-stat-label">粉丝</div></div>'+
        '<div class="cc-stat-item"><div class="cc-stat-num">'+c.likes+'</div><div class="cc-stat-label">获赞</div></div>'+
      '</div>'+
      '<button class="cc-follow-btn" data-user-id="'+c.id+'" onclick="event.stopPropagation();toggleFollow(this)">+ 关注</button>'+
      '<ul class="cc-actions">'+
        '<li class="cc-action-btn cc-view" title="查看主页" onclick="event.stopPropagation();openCreatorDetail(\''+c.id+'\')"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></li>'+
        '<li class="cc-action-btn cc-follow-act" data-user-id="'+c.id+'" title="关注" onclick="event.stopPropagation();toggleFollow(this)"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M16 11V3H8v6H2v12h20V11h-6zm-6 8c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z"/></svg></li>'+
        '<li class="cc-action-btn cc-like" title="点赞" onclick="event.stopPropagation()"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></li>'+
      '</ul>';
    grid.appendChild(card);
  });
}
function loadCreators(){
  // 使用 API 获取，失败时用 fallback
  API.get('/api/creators').then(function(resp){
    var data=(resp && resp.creators) ? resp.creators : (Array.isArray(resp) ? resp : []);
    if(data&&data.length){CREATOR_DATA=data;renderCreators(CREATOR_DATA)}
    else{renderCreators(CREATOR_FALLBACK)}
  }).catch(function(){
    renderCreators(CREATOR_FALLBACK);
  });
}
// 挂载到 selectTab 时调用
var _origSelectTab=selectTab;
selectTab=function(btn,target){
  _origSelectTab(btn,target);
  if(target==='/creators')loadCreators();
};
function toggleSearch(){
  var i=document.getElementById('navSearch');i.classList.toggle('open');if(i.classList.contains('open'))i.focus()
}
document.addEventListener('click',function(e){
  var w=document.querySelector('.nav-search-wrap');
  if(w&&!w.contains(e.target)){var i=document.getElementById('navSearch');if(i)i.classList.remove('open')}
});
function toggleCard(h){
  var c=h.parentElement;var b=c.querySelector('.sc-body');var a=c.querySelector('.sc-arrow');var o=b.classList.contains('open');
  document.querySelectorAll('.sc-body.open').forEach(function(x){x.classList.remove('open');x.closest('.showcase-card').querySelector('.sc-arrow').classList.remove('open');x.closest('.showcase-card').classList.remove('open-card')});
  if(!o){b.classList.add('open');a.classList.add('open');c.classList.add('open-card')}
}
var obs=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('visible');obs.unobserve(e.target)}})},{threshold:0.2});
document.querySelectorAll('.reveal,.reveal-stagger').forEach(function(el){obs.observe(el)});
async function toggleFollow(btn){
  var userId=btn.getAttribute('data-user-id');
  if(!userId||!API.isLoggedIn()){
    showToast('请先登录后再关注创作者','error');
    showLoginModal();
    return;
  }
  try{
    var r=await API.post('/api/users/'+userId+'/follow',{});
    if(r.following){
      btn.classList.add('following');
      if(btn.classList.contains('cc-follow-btn')){
        btn.textContent='已关注';
        btn.style.background='#E0E0E0';btn.style.color='#888';
      }else if(btn.classList.contains('cc-action-btn')){
        btn.style.background='#22c55e';btn.querySelector('svg').style.fill='#fff';
      }else{
        btn.textContent='已关注';
      }
    }else{
      btn.classList.remove('following');
      if(btn.classList.contains('cc-follow-btn')){
        btn.textContent='+ 关注';
        btn.style.background='';btn.style.color='';
      }else if(btn.classList.contains('cc-action-btn')){
        btn.style.background='';btn.querySelector('svg').style.fill='';
      }else{
        btn.textContent='+ 关注';
      }
    }
  }catch(e){
    showToast(e.message||'操作失败','error');
  }
}
function toggleWorkLike(el, workId){
  var c=el.querySelector('.wc-like-count');
  var curr=parseInt(c.textContent)||0;
  // 本地切换函数
  function localToggle(){
    if(el.classList.contains('liked')){
      el.classList.remove('liked');
      c.textContent=Math.max(0,curr-1);
    }else{
      el.classList.add('liked');
      c.textContent=curr+1;
    }
  }
  // 如果没有 workId 或未登录，仅本地切换
  if(!workId){ localToggle(); return; }
  var token=localStorage.getItem('vibe_token');
  if(!token){ localToggle(); return; }
  var userId=localStorage.getItem('vibe_userId');
  // 调后端API
  API.post('/api/works/'+workId+'/like', {}).then(function(res){
    if(res.liked){
      el.classList.add('liked');
    }else{
      el.classList.remove('liked');
    }
    // 优先用服务端真实值，缺失时本地兜底（防止显示 undefined）
    c.textContent=(typeof res.likeCount==='number')?res.likeCount:(res.liked?curr+1:Math.max(0,curr-1));
    // 同步内存数据，保证 renderWeekly(按热度排序) 等重渲染用最新值
    var wd=WORKS_DATA.find(function(x){return x.id===workId});
    if(wd && typeof res.likeCount==='number') wd.likes=res.likeCount;
  }).catch(function(){
    // API失败则回退到本地切换
    localToggle();
  });
}
var WORKS_DATA=[];var MY_WORKS_DATA=[];var ORIG_RENDER_DONE=false;var SEARCH_RESULTS=null;var CURRENT_CATEGORY='all';async function loadDataAPI(){try{var wResp=await API.get('/api/works');var w=(wResp && wResp.works) ? wResp.works : (Array.isArray(wResp) ? wResp : []);WORKS_DATA=w.map(function(x){return{id:x.id,title:x.title,cat:x.category,media:'●',color:'#666',price:x.price||0,desc:x.description||'',tags:x.tags||[],buy:x.xianyuUrl||'',free:!x.price,author:x.creatorId||'匿名',likes:x.likes||0,status:x.status||'draft'}});}catch(e){}try{if(API.token()){var m=await API.get('/api/auth/me');var username=m.displayName||m.username||API.username();var init=username.charAt(0).toUpperCase();var avatarEl=document.getElementById('cwAvatar');if(avatarEl)avatarEl.textContent=init;var nameEl=document.getElementById('cwName');if(nameEl)nameEl.textContent=username;var topNameEl=document.getElementById('cwUserName');if(topNameEl)topNameEl.textContent=username;var topAvatarEl=document.getElementById('cwUserAvatar');if(topAvatarEl)topAvatarEl.textContent=init;var roleEl=document.getElementById('cwRole');if(roleEl&&m.role)roleEl.textContent=m.role;var aResp=await API.get('/api/works');var a=(aResp && aResp.works) ? aResp.works : (Array.isArray(aResp) ? aResp : []);var ml=a.filter(function(w){return w.creatorId===m.id});MY_WORKS_DATA=ml.map(function(x){return{id:x.id,title:x.title,cat:x.category,media:'●',color:'#666',price:x.price||0,desc:x.description||'',tags:x.tags||[],status:x.isApproved?'published':'pending',likes:x.likes||0,date:(x.createdAt||'').slice(0,10)}});checkNotifications();}}catch(e){}ORIG_RENDER_DONE=true;renderWeekly();renderWorks('all');renderMyWorks('all');}loadDataAPI();
// 管理员自动显示管理tab
if(API.isAdmin()){document.body.classList.add('ds-admin')}
function renderWeekly(){
  var t=document.getElementById('weeklyTrack');
  var s=[...WORKS_DATA].sort(function(a,b){return(b.likes||0)-(a.likes||0)});
  var o=s.slice(0,6);t.innerHTML='';
  o.forEach(function(w,i){
    var c=document.createElement('div');c.className='wb-card';
    c.setAttribute('onclick','openWorkDetail("'+w.id+'")');
    var init=(w.author||'匿名').charAt(0).toUpperCase();
    c.innerHTML='<div class="wb-card-inner">'+
      '<div class="wb-card-front">'+
        '<div class="wb-top"><span class="wb-label">Creator</span><span class="wb-rank">#'+(i+1)+'</span></div>'+
        '<div class="wb-avatar" style="background:'+w.color+'">'+init+'</div>'+
        '<div class="wb-author">'+escapeHtml(w.author||'匿名')+'</div>'+
        '<div class="wb-tagline">设计师 · ❤️ '+(120-i*12)+'</div>'+
      '</div>'+
      '<div class="wb-card-back">'+
        '<div class="wb-back-title">'+escapeHtml(w.title)+'</div>'+
        '<div class="wb-back-media" style="background:'+w.color+'"><span style="font-size:48px">'+w.media+'</span></div>'+
        '<div class="wb-back-tags">'+w.tags.slice(0,3).map(function(t){return '<span>'+escapeHtml(t)+'</span>'}).join('')+'</div>'+
      '</div>'+
    '</div>';
    t.appendChild(c)
  })
}
function renderWorks(c){
  var g=document.getElementById('worksGrid');
  var f=c==='all'?WORKS_DATA:WORKS_DATA.filter(function(w){return w.cat===c});
  g.innerHTML='';
  var catMap={'visual':'视觉设计','digital-product':'数字产品','inspiration':'灵感展示'};
  f.forEach(function(w,i){
    var d=document.createElement('div');d.className='work-card';
    d.setAttribute('onclick','openWorkDetail("'+w.id+'")');
    d.innerHTML=
      '<div class="wc-img" style="background:'+w.color+'">'+
        w.media+
        '<div class="wc-like" onclick="event.stopPropagation();toggleWorkLike(this,\''+w.id+'\')">'+
          '<svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>'+
          '<span class="wc-like-count">'+(w.likes||0)+'</span>'+
        '</div>'+
        '<div class="wc-save" title="收藏" onclick="event.stopPropagation()">'+
          '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>'+
        '</div>'+
      '</div>'+
      '<div class="wc-text">'+
        '<div class="wc-title">'+escapeHtml(w.title)+'</div>'+
        '<div class="wc-meta">'+escapeHtml(w.author||'匿名')+' · '+(catMap[w.cat]||'作品')+'</div>'+
        '<div class="wc-tag">'+
          '<svg viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>'+
          (catMap[w.cat]||'作品')+
        '</div>'+
      '</div>';
    g.appendChild(d)
  })
}
function searchWorks(){
  var el=document.querySelector('.ws-search-input');
  var sel=document.querySelector('.ws-sort-select');
  if(!el||!sel)return;
  var q=el.value.trim();
  var sort=sel.value;
  var params='?sort='+sort;
  if(q)params+='&search='+encodeURIComponent(q);
  API.get('/api/works'+params).then(function(raw){
    var list=(raw && raw.works) ? raw.works : (Array.isArray(raw) ? raw : []);
    var mapped=list.map(function(x){return{id:x.id,title:x.title,cat:x.category,media:'●',color:'#666',price:x.price||0,desc:x.description||'',tags:x.tags||[],buy:x.xianyuUrl||'',free:!x.price,author:x.creatorId||'匿名',likes:x.likes||0}});
    SEARCH_RESULTS=mapped;
    var filtered=CURRENT_CATEGORY==='all'?mapped:mapped.filter(function(w){return w.cat===CURRENT_CATEGORY});
    renderWorksFromApi(filtered);
  }).catch(function(){
    if(CURRENT_CATEGORY==='all'){renderWorksFromApi(WORKS_DATA)}
    else{renderWorksFromApi(WORKS_DATA.filter(function(w){return w.cat===CURRENT_CATEGORY}))}
  });
}
function renderWorksFromApi(data){
  var g=document.getElementById('worksGrid');
  g.innerHTML='';
  var cm={'visual':'视觉设计','digital-product':'数字产品','inspiration':'灵感展示'};
  data.forEach(function(w){
    var d=document.createElement('div');d.className='work-card';
    d.setAttribute('onclick','openWorkDetail("'+w.id+'")');
    d.innerHTML=
      '<div class="wc-img" style="background:'+w.color+'">'+
        w.media+
        '<div class="wc-like" onclick="event.stopPropagation();toggleWorkLike(this,\''+w.id+'\')">'+
          '<svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>'+
          '<span class="wc-like-count">'+(w.likes||0)+'</span>'+
        '</div>'+
        '<div class="wc-save" title="收藏" onclick="event.stopPropagation()">'+
          '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>'+
        '</div>'+
      '</div>'+
      '<div class="wc-text">'+
        '<div class="wc-title">'+escapeHtml(w.title)+'</div>'+
        '<div class="wc-meta">'+escapeHtml(w.author||'匿名')+' · '+(cm[w.cat]||'作品')+'</div>'+
        '<div class="wc-tag">'+
          '<svg viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>'+
          (cm[w.cat]||'作品')+
        '</div>'+
      '</div>';
    g.appendChild(d)
  })
}
function filterWorks(el,cat){
  document.querySelectorAll('.ws-cat').forEach(function(c){c.classList.remove('active')});
  el.classList.add('active');CURRENT_CATEGORY=cat;
  if(SEARCH_RESULTS!==null){
    var filtered=cat==='all'?SEARCH_RESULTS:SEARCH_RESULTS.filter(function(w){return w.cat===cat});
    renderWorksFromApi(filtered)
  }else{renderWorks(cat)}
}
var catMap={'visual':'视觉设计','digital-product':'数字产品','inspiration':'灵感展示'};
function openWorkDetail(id){
  var w=WORKS_DATA.find(function(x){return x.id===id});if(!w)return;

  // 查找真实创作者名称
  var allCreators=CREATOR_DATA.length?CREATOR_DATA:CREATOR_FALLBACK;
  var creator=allCreators.find(function(c){return c.id===w.author});
  if(!creator&&CREATOR_DATA.length)creator=CREATOR_FALLBACK.find(function(c){return c.id===w.author});
  var creatorName=creator?creator.name:(w.author||'匿名');

  // 卡片 1
  setText('wdPBadge1','✨ '+(catMap[w.cat]||'精选'));
  setText('wdPTitle1',w.title);
  setText('wdPDesc1',w.desc);
  setText('wdPTrustBig1',w.price>0?'¥'+w.price:'免费');
  setText('wdPTrustHL1','by '+creatorName);
  setText('wdPFeatTitle',w.title);
  setText('wdPFeatDesc',w.desc.slice(0,40));
  setText('wdAuthorLabel1','✧ '+creatorName);

  // 卡片 2
  setText('wdPFeatTitle2','作品集 · '+creatorName);
  setText('wdPFeatDesc2',w.tags.slice(0,3).join(' · '));
  setText('wdPTrustBig2',w.price>0?'¥'+w.price:'免费');
  setText('wdPTrustHL2',w.tags[0]||'设计');
  setText('wdAuthorLabel2','✧ '+creatorName);

  // 右栏 — 信息
  setText('wdInfoAuthor',creatorName);
  setText('wdInfoTitle',w.title);
  setText('wdInfoDesc',w.desc);

  // Tags
  var tagsEl=document.getElementById('wdInfoTags');
  if(tagsEl)tagsEl.innerHTML=w.tags.map(function(t){return '<span class="wd-info-tag">#'+escapeHtml(t)+'</span>'}).join('');

  // 购买按钮
  var buyBtn=document.getElementById('wdInfoBuy');
  if(buyBtn){
    if(w.free||!w.buy){
      buyBtn.textContent='📥 免费作品';
      buyBtn.removeAttribute('href');
      buyBtn.style.cursor='default';
      buyBtn.style.opacity='.7';
    }else{
      buyBtn.innerHTML='🛒 去闲鱼购买';
      buyBtn.href=w.buy;
      buyBtn.style.cursor='pointer';
      buyBtn.style.opacity='1';
    }
  }

  // 点赞按钮
  var likeBtn=document.getElementById('wdInfoLike');
  var likeCount=document.getElementById('wdInfoLikeCount');
  if(likeBtn&&likeCount){
    likeBtn.classList.remove('liked');
    likeCount.textContent=w.likes||0;
    likeBtn.onclick=function(e){ e.stopPropagation(); toggleWorkLike(this, id); };
  }

  // 详细介绍
  var detailEl=document.getElementById('wdInfoDetail');
  if(detailEl){
    var catName=catMap[w.cat]||'作品';
    detailEl.innerHTML=
      '【作品信息】由 <strong>'+escapeHtml(creatorName)+'</strong> 创作，属于 '+
      catName+' 类设计作品。涵盖 '+(w.tags.slice(0,2).map(function(t){return escapeHtml(t)}).join('、')||'设计')+
      ' 等领域。'+
      (w.price>0?'售价 <strong>¥'+w.price+'</strong>，通过闲鱼平台安全交易。':'免费作品，可直接下载使用。')+
      '<br><br>'+
      '【适用场景】适合需要'+(w.tags.slice(0,2).map(function(t){return escapeHtml(t)}).join('、')||'设计灵感')+'的设计师、创作者与创业团队。'+
      '作品提供完整设计源文件，支持二次修改与商业使用。';
  }

  // 底部补充
  var extraEl=document.getElementById('wdInfoExtra');
  if(extraEl){
    extraEl.textContent='标签：'+w.tags.join(' · ')+' ｜ 分类：'+(catMap[w.cat]||'作品')+' ｜ 作者：'+creatorName;
  }

  // 导航到详情弹窗（Overlay 方式）
  var ws=document.getElementById('workDetailSection');
  if(ws){
    // 不隐藏其他 section — 遮罩层叠在顶部
    ws.classList.add('active');
    // 锁定滚动
    document.body.style.overflow='hidden';
    window.scrollTo(0,0);
  }
}
function openCreatorDetail(id){
  // 从 CREATOR_DATA 或 CREATOR_FALLBACK 找创作者
  var allCreators=CREATOR_DATA.length?CREATOR_DATA:CREATOR_FALLBACK;
  var c=allCreators.find(function(x){return x.id===id});
  // 如果在主数据中没找到，再查 fallback
  if(!c&&CREATOR_DATA.length)c=CREATOR_FALLBACK.find(function(x){return x.id===id});
  if(!c)return;
  var idx=allCreators.indexOf(c);
  var init=c.name.charAt(0).toUpperCase();
  var grad=CREATOR_GRADIENT[idx%CREATOR_GRADIENT.length];

  // 填充右栏
  var avatarEl=document.getElementById('cdSidebarAvatar');
  if(avatarEl){avatarEl.textContent=init;avatarEl.style.background=grad}
  setText('cdSidebarName',c.name);
  setText('cdSidebarRole',c.role);
  setText('cdStatWorks',c.works);
  setText('cdStatFollowers',c.followers);
  setText('cdStatLikes',c.likes);
  setText('cdSidebarDesc',c.desc||'这位创作者还没有介绍自己');

  // 给侧栏“关注”按钮写入当前创作者 id（toggleFollow 依赖 data-user-id）
  var followBtn=document.querySelector('.cd-sidebar-follow');
  if(followBtn)followBtn.setAttribute('data-user-id',c.id);

  // 填充左栏作品网格
  var grid=document.getElementById('cdWorksGrid');
  if(grid){
    var works=WORKS_DATA.filter(function(w){return w.author===c.id});
    setText('cdLeftTitle','TA的作品 ('+works.length+')');
    if(works.length===0){
      grid.innerHTML='<div style="color:rgba(255,255,255,.4);padding:40px 0;text-align:center;font-size:14px">暂无作品</div>';
    }else{
      var cm={'visual':'视觉设计','digital-product':'数字产品','inspiration':'灵感展示'};
      grid.innerHTML=works.map(function(w){
        var wi=(w.author||'匿名').charAt(0).toUpperCase();
        return '<div class="cd-work-card" onclick="closeCreatorDetail();openWorkDetail(\''+w.id+'\')">'+
          '<div class="cd-work-thumb" style="background:'+w.color+'">'+wi+'</div>'+
          '<div class="cd-work-info">'+
            '<div class="cd-work-name">'+escapeHtml(w.title)+'</div>'+
            '<span class="cd-work-cat">'+(cm[w.cat]||'作品')+'</span>'+
          '</div>'+
        '</div>';
      }).join('');
    }
  }

  // 打开弹窗
  var ws=document.getElementById('creatorDetailSection');
  if(ws){
    ws.classList.add('active');
    document.body.style.overflow='hidden';
    window.scrollTo(0,0);
  }
}
function closeCreatorDetail(){
  var ws=document.getElementById('creatorDetailSection');
  if(ws)ws.classList.remove('active');
  document.body.style.overflow='auto';
  window.scrollTo(0,0);
}
function closeWorkDetail(){
  var ws=document.getElementById('workDetailSection');
  if(ws)ws.classList.remove('active');
  // 恢复滚动 — 回到可滚动的作品列表页
  document.body.style.overflow='auto';
  window.scrollTo(0,0);
}
function setText(id,txt){
  var el=document.getElementById(id);
  if(el)el.textContent=txt;
}
// loadDataAPI() now handles initial render
// ===== 我的作品页 =====
var MY_WORKS_DATA=[];

function renderMyWorks(filter){
  filter=filter||'all';
  var list=document.getElementById('cwWorksList');
  var empty=document.getElementById('cwEmpty');
  // 未登录处理
  var isLoggedIn=API.isLoggedIn();
  var prompt=document.getElementById('cwLoginPrompt');
  var area=document.getElementById('cwLoggedInArea');
  var topBar=document.getElementById('cwTopBar');
  if(!isLoggedIn){
    if(prompt)prompt.style.display='block';
    if(area)area.style.display='none';
    if(topBar)topBar.style.display='none';
    return;
  }else{
    if(prompt)prompt.style.display='none';
    if(area)area.style.display='block';
    if(topBar)topBar.style.display='flex';
  }
  var f=filter==='all'?MY_WORKS_DATA:MY_WORKS_DATA.filter(function(w){return w.status===filter});
  if(f.length===0){list.innerHTML='';empty.style.display='block';return}
  empty.style.display='none';
  var catMap={'visual':'视觉设计','digital-product':'数字产品','inspiration':'灵感展示'};
  var statusMap={'published':'已发布','draft':'草稿','pending':'审核中'};
  list.innerHTML=f.map(function(w){
    // 尝试用图片或者emoji作为缩略图
    var thumbContent=w.media==='●'?'<span style="font-size:22px">🎨</span>':w.media;
    var likes=w.likes||0;
    var priceText=w.price===0?'免费':'¥'+w.price;
    var priceClass=w.price===0?' free':'';
    var statusText=statusMap[w.status]||w.status;
    return '<div class="cw-work-item">'+
      '<div class="cw-work-thumb" style="background:'+w.color+'">'+thumbContent+'</div>'+
      '<div class="cw-work-info">'+
        '<div class="cw-work-title">'+escapeHtml(w.title)+'</div>'+
        '<div class="cw-work-meta">'+
          '<span>📅 '+w.date+'</span>'+
          '<span>❤️ '+likes+'</span>'+
        '</div>'+
      '</div>'+
      '<span class="cw-work-cat">'+(catMap[w.cat]||'作品')+'</span>'+
      '<span class="cw-work-status '+w.status+'">'+statusText+'</span>'+
      '<span class="cw-work-price'+priceClass+'">'+priceText+'</span>'+
      '<div class="cw-work-actions">'+
        '<button class="cw-action-btn" title="编辑" onclick="event.stopPropagation();openEditWork(\''+w.id+'\')"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>'+
        '<button class="cw-action-btn danger" title="删除" onclick="event.stopPropagation();deleteMyWork(\''+w.id+'\')"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>'+
      '</div>'+
    '</div>';
  }).join('');
  // 更新统计
  var pub=MY_WORKS_DATA.filter(function(w){return w.status==='published'}).length;
  var totalLikes=MY_WORKS_DATA.reduce(function(s,w){return s+(w.likes||0)},0);
  var totalCodes=10;
  var usedCodes=pub>totalCodes?totalCodes:pub;
  var remain=totalCodes-usedCodes;
  document.getElementById('cwWorkCount').textContent=MY_WORKS_DATA.length;
  document.getElementById('cwLikeCount').textContent=totalLikes;
  document.getElementById('cwCodeCount').textContent=remain;
  document.getElementById('cwCodesUsed').textContent=usedCodes+' / '+totalCodes;
  document.getElementById('cwCodesFill').style.width=(usedCodes/totalCodes*100)+'%';
  document.getElementById('cwCodesRemain').textContent=remain;
  renderAdminPanel();
}

// ===== 管理面板函数（管理员） =====
// ===== 管理面板（suffix=''=创作者面板, '2'=独立管理页） =====
function renderAdminPanel(suffix){
  suffix = suffix || '';
  if(!suffix){
    var panel=document.getElementById('cwAdminPanel');
    if(!panel)return;
    if(!API.isAdmin()){panel.style.display='none';return}
    panel.style.display='block';
  }else{
    if(!API.isAdmin())return;
  }
  // 加载统计
  API.get('/api/stats').then(function(data){
    var el=document.getElementById('adminTotalWorks'+suffix);if(el)el.textContent=data.totalWorks||0;
    el=document.getElementById('adminTotalLikes'+suffix);if(el)el.textContent=data.totalLikes||0;
    el=document.getElementById('adminCodesUsed'+suffix);if(el)el.textContent=data.codesUsed||0;
    el=document.getElementById('adminCodesRemain'+suffix);if(el)el.textContent=data.codesRemain||0;
  }).catch(function(e){console.warn('Admin stats load failed',e)});
  // 加载交易记录
  API.get('/api/codes').then(function(resp){
    var codes=(resp && resp.codes) ? resp.codes : (Array.isArray(resp) ? resp : []);
    if(!Array.isArray(codes))return;
    var tiers=[
      {prefix:'SPRT-1',name:'入门',price:9.9},
      {prefix:'SPRT-2',name:'进阶',price:29.9},
      {prefix:'SPRT-3',name:'专业',price:69.9}
    ];
    var totalGen=0,totalUsed=0,totalRev=0;
    var rows=tiers.map(function(t){
      var tc=codes.filter(function(c){return c.code&&c.code.startsWith(t.prefix)});
      var gen=tc.length;
      var used=tc.filter(function(c){return c.used}).length;
      var rate=gen>0?(used/gen*100):0;
      totalGen+=gen;totalUsed+=used;totalRev+=used*t.price;
      return '<tr>'+
        '<td class="trade-cell-tier">'+t.name+'</td>'+
        '<td class="trade-cell-prefix">'+t.prefix+'</td>'+
        '<td class="trade-cell-price">¥'+t.price.toFixed(1)+'</td>'+
        '<td class="trade-cell-num">'+gen+'</td>'+
        '<td class="trade-cell-num">'+used+'</td>'+
        '<td class="trade-cell-rate">'+rate.toFixed(1)+'%</td>'+
      '</tr>';
    });
    var tb=document.getElementById('cwAdminTradeBody'+suffix);if(tb)tb.innerHTML=rows.join('');
    var tf=document.getElementById('cwAdminTradeFoot'+suffix);if(tf)tf.innerHTML='<tr>'+
      '<td colspan="3" class="trade-foot-label">📊 合计</td>'+
      '<td class="trade-cell-num trade-foot-val">'+totalGen+'</td>'+
      '<td class="trade-cell-num trade-foot-val">'+totalUsed+'</td>'+
      '<td class="trade-cell-rate trade-foot-val">¥'+totalRev.toFixed(2)+'</td>'+
    '</tr>';
  }).catch(function(e){console.warn('Admin trade load failed',e)});
  renderAdminWorksList(suffix);
  if(suffix) renderFeedbackList();
  // 保持原有行为：创作者面板加载时同时加载独立管理页数据
  if(!suffix) renderAdminPanel('2');
}
function renderAdminWorksList(suffix){
  suffix = suffix || '';
  var list=document.getElementById('cwAdminWorksList'+suffix);
  if(!list)return;
  list.innerHTML=WORKS_DATA.map(function(w){
    var likes=w.likes||0;
    var priceText=w.price===0?'免费':'¥'+(w.price||0);
    var isReviewed=w.status==='published';
    var reviewLabel=isReviewed?'已审核':'待审核';
    var reviewClass=isReviewed?'reviewed':'pending-review';
    return '<div class="cw-admin-work-item">'+
      '<span class="cw-admin-work-title">'+escapeHtml(w.title)+'</span>'+
      '<span class="cw-admin-work-likes">❤️ '+likes+'</span>'+
      '<span class="cw-admin-work-price">'+priceText+'</span>'+
      '<span class="cw-admin-work-review '+reviewClass+'">'+reviewLabel+'</span>'+
      '<div class="cw-admin-work-actions">'+
        '<button class="btn-approve" onclick="handleWorkApproval(\''+w.id+'\',true,\''+suffix+'\')">通过</button>'+
        '<button class="btn-reject" onclick="handleWorkApproval(\''+w.id+'\',false,\''+suffix+'\')">拒绝</button>'+
      '</div>'+
    '</div>';
  }).join('');
}
// ===== 作品审核操作 =====
async function handleWorkApproval(id, approved, suffix){
  suffix = suffix || '';
  var label=approved?'通过':'拒绝';
  try{
    await API.patch('/api/works/'+id,{isApproved:approved});
    showToast('✅ 作品已'+label,'success');
    // 重新加载数据
    var wResp=await API.get('/api/works');
    var w=(wResp && wResp.works) ? wResp.works : (Array.isArray(wResp) ? wResp : []);
    WORKS_DATA=w.map(function(x){return{id:x.id,title:x.title,cat:x.category,media:'●',color:'#666',price:x.price||0,desc:x.description||'',tags:x.tags||[],buy:x.xianyuUrl||'',free:!x.price,author:x.creatorId||'匿名',likes:x.likes||0,status:x.status||'draft'}});
    renderAdminWorksList(suffix);
  }catch(e){
    showToast('❌ 审核操作失败：'+(e.message||'未知错误'),'error');
  }
}
function generateCodes(prefix, suffix){
  suffix = suffix || '';
  var resultEl=document.getElementById('cwAdminCodeResult'+suffix);
  if(!resultEl)return;
  resultEl.className='cw-admin-code-result loading';
  resultEl.textContent='⏳ 正在生成 '+prefix+' 验证码...';
  API.post('/api/codes',{action:'generate',prefix:prefix,batch:20}).then(function(data){
    var count=data.count||(data.codes?data.codes.length:20);
    resultEl.className='cw-admin-code-result success';
    resultEl.textContent='✅ 生成成功：'+count+' 个 '+prefix+' 验证码';
  }).catch(function(e){
    resultEl.className='cw-admin-code-result error';
    resultEl.textContent='❌ 生成失败：'+(e.message||'未知错误');
  });
}
function renderFeedbackList(){
  var list=document.getElementById('cwAdminFeedbackList2');
  if(!list)return;
  API.get('/api/feedbacks').then(function(data){
    if(!data||!data.length){
      list.innerHTML='<div style="color:#999;text-align:center;padding:20px">暂无用户反馈</div>';
      return;
    }
    list.innerHTML=data.map(function(f){
      var d=new Date(f.createdAt);
      var time=d.toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
      return '<div class="cw-feedback-item">'+
        '<div class="cw-feedback-meta"><span class="cw-feedback-user">'+escapeHtml(f.displayName || f.username)+'</span><span class="cw-feedback-time">'+time+'</span></div>'+
        '<div class="cw-feedback-content">'+escapeHtml(f.content)+'</div>'+
      '</div>';
    }).join('');
  }).catch(function(){
    list.innerHTML='<div style="color:#f87171;text-align:center;padding:20px">加载失败</div>';
  });
}

// 向后兼容：HTML onclick 引用的旧函数名
function renderAdminPanel2(){ renderAdminPanel('2'); }
function generateCodes2(prefix){ generateCodes(prefix, '2'); }

// ===== 编辑作品弹窗 =====
var EDITING_WORK_ID=null;

function openEditWork(id){
  // 查找当前作品数据
  var work=null;
  for(var i=0;i<MY_WORKS_DATA.length;i++){
    if(MY_WORKS_DATA[i].id===id){work=MY_WORKS_DATA[i];break}
  }
  if(!work){console.warn('Work not found',id);return}
  EDITING_WORK_ID=id;
  // 预填表单
  document.getElementById('ewInputTitle').value=work.title||'';
  document.getElementById('ewInputDesc').value=work.desc||'';
  document.getElementById('ewInputPrice').value=work.price||0;
  document.getElementById('ewInputTags').value=(work.tags&&work.tags.length)?work.tags.join(', '):'';
  // 打开弹窗
  var ws=document.getElementById('editWorkSection');
  if(ws)ws.classList.add('active');
  document.body.style.overflow='hidden';
}

function closeEditWork(){
  var ws=document.getElementById('editWorkSection');
  if(ws)ws.classList.remove('active');
  document.body.style.overflow='auto';
  EDITING_WORK_ID=null;
}

async function saveEditWork(){
  var id=EDITING_WORK_ID;
  if(!id)return;
  var title=document.getElementById('ewInputTitle').value.trim();
  var desc=document.getElementById('ewInputDesc').value.trim();
  var price=parseFloat(document.getElementById('ewInputPrice').value)||0;
  var tagsStr=document.getElementById('ewInputTags').value.trim();
  var tags=tagsStr?tagsStr.split(',').map(function(t){return t.trim()}).filter(function(t){return t}):[];
  if(!title){alert('请输入作品名');return}
  var btn=document.getElementById('ewBtnSave');
  btn.textContent='保存中...';
  btn.disabled=true;
  try{
    await API.patch('/api/works/'+id,{title:title,description:desc,price:price,tags:tags});
    closeEditWork();
    // 重新加载数据
    var m=await API.get('/api/auth/me');
    var aResp=await API.get('/api/works');
    var a=(aResp && aResp.works) ? aResp.works : (Array.isArray(aResp) ? aResp : []);
    var ml=a.filter(function(w){return w.creatorId===m.id});
    MY_WORKS_DATA=ml.map(function(x){return{id:x.id,title:x.title,cat:x.category,media:'●',color:'#666',price:x.price||0,desc:x.description||'',tags:x.tags||[],status:x.isApproved?'published':'pending',likes:x.likes||0,date:(x.createdAt||'').slice(0,10)}});
    checkNotifications();
    var act=document.querySelector('.cw-filter-btn.active');
    var f=act?act.getAttribute('onclick').match(/'([^']+)'/)[1]:'all';
    renderMyWorks(f);
    renderWeekly();renderWorks('all');
    // 显示成功提示
    var tip=document.createElement('div');
    tip.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9999;background:#CFFF55;color:#1a1a1a;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:600;font-family:\'Inter\',sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.15);opacity:0;transition:opacity .3s ease';
    tip.textContent='✅ 保存成功';
    document.body.appendChild(tip);
    requestAnimationFrame(function(){tip.style.opacity='1'});
    setTimeout(function(){tip.style.opacity='0';setTimeout(function(){tip.remove()},300)},2000);
  }catch(e){
    alert('保存失败：'+(e.message||'未知错误'));
  }finally{
    btn.textContent='保存';
    btn.disabled=false;
  }
}

function filterMyWorks(btn,filter){
  document.querySelectorAll('.cw-filter-btn').forEach(function(b){b.classList.remove('active')});
  btn.classList.add('active');
  renderMyWorks(filter);
}
async function deleteMyWork(id){
  try{
    await API.del('/api/works/'+id);
  }catch(e){
    alert('删除失败: '+e.message);
    return;
  }
  MY_WORKS_DATA=MY_WORKS_DATA.filter(function(w){return w.id!==id});
  var act=document.querySelector('.cw-filter-btn.active');
  var f=act?act.getAttribute('onclick').match(/'([^']+)'/)[1]:'all';
  renderMyWorks(f);
  renderWeekly();renderWorks('all');
}
// 退出登录
function handleLogout(){
  API.logout();
  document.body.classList.remove('ds-admin');
  MY_WORKS_DATA=[];
  renderMyWorks('all');
  renderWeekly();renderWorks('all');
  // 回到首页
  var homeTab=document.querySelector('.nav-tab');
  if(homeTab)selectTab(homeTab,'/');
}
// ===== 登录/注册/找回密码 三面板滑动弹窗 =====
// 公用样式片段
var LM_INPUT='display:block;width:100%;padding:12px 16px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#fff;border-radius:10px;font-size:15px;font-family:Inter,sans-serif;outline:none;margin-bottom:12px;box-sizing:border-box';
var LM_MODAL='background:#2a2a2a;border:1px solid rgba(255,255,255,.1);border-radius:14px;width:380px;max-width:90vw';

function buildLoginOverlay(){
  var overlay=document.createElement('div');
  overlay.id='loginOverlay';
  overlay.style.cssText='position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.5);backdrop-filter:blur(4px)';
  overlay.onclick=function(e){if(e.target===overlay)overlay.style.display='none'};

  overlay.innerHTML=
    '<div class="login-modal" style="'+LM_MODAL+'" onclick="event.stopPropagation()">'+
      '<div class="lm-panels" style="overflow:hidden;width:100%;border-radius:14px">'+
        '<div class="lm-track" id="lmTrack" style="display:flex;transition:transform 0.45s cubic-bezier(0.4,0,0.2,1)">'+

          // === 面板 0: 登录 ===
          '<div class="lm-panel" style="min-width:100%;flex-shrink:0;padding:36px 40px;box-sizing:border-box">'+
            '<h2 style="color:#fff;font-size:22px;font-weight:600;margin:0 0 8px">登录</h2>'+
            '<p style="color:rgba(255,255,255,.5);font-size:14px;margin:0 0 24px">登录后管理你的作品</p>'+
            '<div class="lm-error" id="lmError" style="color:#f87171;font-size:13px;margin-bottom:12px;display:none"></div>'+
            '<input class="lm-input" id="lmUser" type="text" placeholder="用户名" style="'+LM_INPUT+'">'+
            '<input class="lm-input" id="lmPass" type="password" placeholder="密码" style="'+LM_INPUT+'">'+
            '<button class="lm-submit" onclick="doLogin()" style="display:block;width:100%;padding:14px;background:#CFFF55;color:#1a1a1a;border:none;border-radius:10px;font-size:16px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;margin-top:12px">登录</button>'+
            '<div style="text-align:right;margin-top:8px"><a onclick="switchLoginPanel(2)" style="color:rgba(255,255,255,.4);cursor:pointer;font-size:12px;text-decoration:none">忘记密码？</a></div>'+
            '<div class="lm-toggle" style="color:rgba(255,255,255,.5);font-size:13px;margin-top:16px;text-align:center">还没有账号？<a onclick="switchLoginPanel(1)" style="color:#CFFF55;cursor:pointer;text-decoration:underline">注册</a></div>'+
          '</div>'+

          // === 面板 1: 注册 ===
          '<div class="lm-panel" style="min-width:100%;flex-shrink:0;padding:36px 40px;box-sizing:border-box">'+
            '<h2 style="color:#fff;font-size:22px;font-weight:600;margin:0 0 8px">注册</h2>'+
            '<p style="color:rgba(255,255,255,.5);font-size:14px;margin:0 0 24px">创建你的创作者账号</p>'+
            '<div class="lm-error" id="rmError" style="color:#f87171;font-size:13px;margin-bottom:12px;display:none"></div>'+
            '<input class="lm-input" id="rmUser" type="text" placeholder="用户名" style="'+LM_INPUT+'">'+
            '<input class="lm-input" id="rmName" type="text" placeholder="显示名称（可选）" style="'+LM_INPUT+'">'+
            '<input class="lm-input" id="rmEmail" type="email" placeholder="邮箱（可选，用于找回密码）" style="'+LM_INPUT+'">'+
            '<input class="lm-input" id="rmPass" type="password" placeholder="密码" style="'+LM_INPUT+'">'+
            '<button class="lm-submit" onclick="doRegister()" style="display:block;width:100%;padding:14px;background:#CFFF55;color:#1a1a1a;border:none;border-radius:10px;font-size:16px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;margin-top:12px">注册</button>'+
            '<div class="lm-toggle" style="color:rgba(255,255,255,.5);font-size:13px;margin-top:16px;text-align:center">已有账号？<a onclick="switchLoginPanel(0)" style="color:#CFFF55;cursor:pointer;text-decoration:underline">去登录</a></div>'+
          '</div>'+

          // === 面板 2: 找回密码 ===
          '<div class="lm-panel" style="min-width:100%;flex-shrink:0;padding:36px 40px;box-sizing:border-box">'+
            '<h2 style="color:#fff;font-size:22px;font-weight:600;margin:0 0 8px">找回密码</h2>'+
            '<p style="color:rgba(255,255,255,.5);font-size:14px;margin:0 0 24px">输入注册邮箱，获取重置令牌</p>'+
            '<div class="lm-error" id="fmError" style="color:#f87171;font-size:13px;margin-bottom:12px;display:none"></div>'+
            '<div class="lm-success" id="fmSuccess" style="color:#4ade80;font-size:13px;margin-bottom:12px;display:none"></div>'+
            '<input class="lm-input" id="fmEmail" type="email" placeholder="注册邮箱" style="'+LM_INPUT+'">'+
            '<p style="color:rgba(255,255,255,.3);font-size:11px;margin-bottom:12px">重置令牌将显示在服务器控制台中（生产环境通过邮件发送）</p>'+
            '<button class="lm-submit" onclick="doForgotPassword()" style="display:block;width:100%;padding:14px;background:#CFFF55;color:#1a1a1a;border:none;border-radius:10px;font-size:16px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;margin-bottom:12px">获取重置令牌</button>'+
            '<hr style="border-color:rgba(255,255,255,.08);margin:12px 0">'+
            '<input class="lm-input" id="fmToken" type="text" placeholder="重置令牌" style="'+LM_INPUT+'">'+
            '<input class="lm-input" id="fmNewPass" type="password" placeholder="新密码（至少6位）" style="'+LM_INPUT+'">'+
            '<button class="lm-submit" onclick="doResetPassword()" style="display:block;width:100%;padding:14px;background:#000;color:#fff;border:1px solid rgba(255,255,255,.2);border-radius:10px;font-size:16px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;margin-bottom:16px">重置密码</button>'+
            '<div class="lm-toggle" style="color:rgba(255,255,255,.5);font-size:13px;text-align:center"><a onclick="switchLoginPanel(0)" style="color:#CFFF55;cursor:pointer;text-decoration:underline">返回登录</a></div>'+
          '</div>'+

        '</div>'+
      '</div>'+
    '</div>';

  document.body.appendChild(overlay);
}

// 切换到指定面板: 0=登录, 1=注册, 2=找回密码
function switchLoginPanel(index){
  var overlay=document.getElementById('loginOverlay');
  if(!overlay){buildLoginOverlay();overlay=document.getElementById('loginOverlay')}
  var track=document.getElementById('lmTrack');
  if(!track){
    // 旧版 overlay 存在但内容不对 — 重建
    overlay.innerHTML='';buildLoginOverlay();overlay=document.getElementById('loginOverlay');
    track=document.getElementById('lmTrack');
  }
  track.style.transform='translateX(-'+index+'00%)';
  overlay.style.display='flex';
  // 聚焦对应面板的第一个输入框
  var focusMap={0:'lmUser',1:'rmUser',2:'fmEmail'};
  var fid=focusMap[index];
  if(fid){var el=document.getElementById(fid);if(el)el.focus()}
}

// 向后兼容入口
function showLoginModal(){switchLoginPanel(0)}
function showRegisterModal(){switchLoginPanel(1)}
function showForgotModal(){switchLoginPanel(2)}
function closeLogin(){
  var el=document.getElementById('loginOverlay');
  if(el)el.style.display='none';
}

async function doForgotPassword(){
  var email=document.getElementById('fmEmail').value.trim();
  var err=document.getElementById('fmError');
  var ok=document.getElementById('fmSuccess');
  err.style.display='none';ok.style.display='none';
  if(!email){err.textContent='请输入注册邮箱';err.style.display='block';return}
  try{
    var r=await API.post('/api/auth/forgot-password',{email:email});
    ok.textContent=r.message+(r.devToken?' (开发令牌: '+r.devToken+')':'');
    ok.style.display='block';
  }catch(e){
    err.textContent=e.message||'请求失败';
    err.style.display='block';
  }
}
async function doResetPassword(){
  var token=document.getElementById('fmToken').value.trim();
  var newPass=document.getElementById('fmNewPass').value;
  var err=document.getElementById('fmError');
  var ok=document.getElementById('fmSuccess');
  err.style.display='none';ok.style.display='none';
  if(!token||!newPass){err.textContent='请填写令牌和新密码';err.style.display='block';return}
  if(newPass.length<6){err.textContent='密码至少6位';err.style.display='block';return}
  try{
    var r=await API.post('/api/auth/reset-password',{token:token,newPassword:newPass});
    ok.textContent=r.message;ok.style.display='block';
    setTimeout(function(){switchLoginPanel(0)},1500);
  }catch(e){
    err.textContent=e.message||'重置失败';
    err.style.display='block';
  }
}
async function doLogin(){
  var user=document.getElementById('lmUser').value.trim();
  var pass=document.getElementById('lmPass').value;
  var err=document.getElementById('lmError');
  if(!user||!pass){err.textContent='请填写用户名和密码';err.style.display='block';return}
  try{
    await API.login(user,pass);
    closeLogin();
    location.reload();
  }catch(e){
    err.textContent=e.message||'登录失败，请检查用户名和密码';
    err.style.display='block';
  }
}
async function doRegister(){
  var user=document.getElementById('rmUser').value.trim();
  var pass=document.getElementById('rmPass').value;
  var name=document.getElementById('rmName').value.trim()||user;
  var email=document.getElementById('rmEmail').value.trim();
  var err=document.getElementById('rmError');
  if(!user||!pass){err.textContent='请填写用户名和密码';err.style.display='block';return}
  if(pass.length<6){err.textContent='密码至少6位';err.style.display='block';return}
  try{
    await API.register(user,pass,name,email);
    closeLogin();
    location.reload();
  }catch(e){
    err.textContent=e.message||'注册失败';
    err.style.display='block';
  }
}
// ===== 验证码购买流程 =====
// 定价档位数据
var PRICING_TIERS=[
  {prefix:'SPRT-1',name:'入门',price:9.9,desc:'新手试水，低成本开始'},
  {prefix:'SPRT-2',name:'进阶',price:29.9,desc:'活跃创作者首选'},
  {prefix:'SPRT-3',name:'专业',price:69.9,desc:'工作室级批量上架'}
];
// 获取用户已拥有的验证码数量（按档位）
function getUserCodes(){
  try{
    var raw=localStorage.getItem('vibe_verified_codes');
    return raw?JSON.parse(raw):{'SPRT-1':0,'SPRT-2':0,'SPRT-3':0};
  }catch(e){return {'SPRT-1':0,'SPRT-2':0,'SPRT-3':0}}
}
// 获取购买意图记录
function getPurchaseIntents(){
  try{
    var raw=localStorage.getItem('vibe_purchase_intents');
    return raw?JSON.parse(raw):[];
  }catch(e){return []}
}
// 渲染定价卡片中的动态按钮
function renderPricingCards(){
  var wrappers=document.querySelectorAll('.pc-btn-wrapper');
  if(!wrappers.length)return;
  var loggedIn=API.isLoggedIn();
  var userCodes=loggedIn?getUserCodes():{};
  wrappers.forEach(function(w){
    var tier=w.getAttribute('data-tier');
    var tierName=w.getAttribute('data-tier-name');
    var price=parseFloat(w.getAttribute('data-price'));
    if(loggedIn){
      var count=userCodes[tier]||0;
      w.innerHTML='<button class="pc-btn" onclick="showBuyConfirm(\''+tier+'\',\''+tierName+'\','+price+')">订阅</button>'+
        '<span class="pc-owned-count">已拥有 <strong style="color:#CFFF55">'+count+'</strong> 个</span>';
    }else{
      w.innerHTML='<a class="pc-login-link" href="javascript:void(0)" onclick="showLoginModal()">登录后订阅</a>';
    }
  });
}
// 购买确认弹窗
function showBuyConfirm(tier,tierName,price){
  var overlay=document.createElement('div');
  overlay.className='buy-confirm-overlay';
  overlay.id='buyConfirmOverlay';
  overlay.onclick=function(e){if(e.target===this)closeBuyConfirm()};
  overlay.innerHTML='<div class="buy-confirm-modal" onclick="event.stopPropagation()">'+
    '<h3>确认订阅</h3>'+
    '<p class="bcm-desc">你即将订阅 <strong style="color:#fff">'+tierName+'</strong> 方案</p>'+
    '<div class="bcm-price">¥'+price.toFixed(1)+'</div>'+
    '<div class="bcm-actions">'+
      '<button class="bcm-btn bcm-btn-cancel" onclick="closeBuyConfirm()">取消</button>'+
      '<button class="bcm-btn bcm-btn-confirm" onclick="confirmBuy(\''+tier+'\',\''+tierName+'\','+price+')">确认订阅</button>'+
    '</div>'+
    '<div style="margin-top:16px;font-size:12px;color:rgba(255,255,255,.35)">购买验证码后，在闲鱼订单中备注你的用户名以便核对</div>'+
  '</div>';
  document.body.appendChild(overlay);
}
function closeBuyConfirm(){
  var el=document.getElementById('buyConfirmOverlay');
  if(el)el.remove();
}
// 确认购买 → 保存意图 + 跳转闲鱼
function confirmBuy(tier,tierName,price){
  closeBuyConfirm();
  // 记录购买意图到 localStorage
  var intents=getPurchaseIntents();
  intents.push({
    tier:tier,
    tierName:tierName,
    price:price,
    username:API.username(),
    date:new Date().toISOString()
  });
  localStorage.setItem('vibe_purchase_intents',JSON.stringify(intents));
  // 跳转闲鱼
  window.open('https://www.xianyu.com','_blank','noopener');
}
// 显示"我的验证码"弹窗
function showMyCodesModal(){
  var codes=getUserCodes();
  var total=0;
  var tierListHtml=PRICING_TIERS.map(function(t){
    var count=codes[t.prefix]||0;
    total+=count;
    return '<div class="cm-tier-item">'+
      '<div class="cm-tier-left">'+
        '<span class="cm-tier-prefix">'+t.prefix+'</span>'+
        '<span class="cm-tier-name">'+t.name+'</span>'+
      '</div>'+
      '<span class="cm-tier-count">已拥有 <strong>'+count+'</strong> 个</span>'+
    '</div>';
  }).join('');
  var overlay=document.createElement('div');
  overlay.className='codes-modal-overlay';
  overlay.id='codesModalOverlay';
  overlay.onclick=function(e){if(e.target===this)closeMyCodesModal()};
  overlay.innerHTML='<div class="codes-modal" onclick="event.stopPropagation()">'+
    '<div class="cm-header">'+
      '<span class="cm-title">🎫 我的验证码</span>'+
      '<button class="cm-close" onclick="closeMyCodesModal()">✕</button>'+
    '</div>'+
    '<div class="cm-tier-list">'+tierListHtml+'</div>'+
    '<div class="cm-total">总计 <strong>'+total+'</strong> 个验证码</div>'+
  '</div>';
  document.body.appendChild(overlay);
}
function closeMyCodesModal(){
  var el=document.getElementById('codesModalOverlay');
  if(el)el.remove();
}
// 更新验证码总数徽标
function updateCodeBadge(){
  var badge=document.getElementById('cceCodeCount');
  if(!badge)return;
  if(!API.isLoggedIn()){badge.textContent='0';return}
  var codes=getUserCodes();
  var total=0;
  for(var k in codes)total+=codes[k];
  badge.textContent=total;
}
// 监听页面切换，重新渲染定价按钮
(function(){
  var origSelectTab=window.selectTab;
  if(origSelectTab){
    var origFn=origSelectTab;
    window.selectTab=function(btn,target){
      origFn(btn,target);
      if(target==='/pricing'){
        renderPricingCards();
        updateCodeBadge();
      }
      if(target==='/my-works'){
        updateCodeBadge();
      }
      if(target==='/admin'&&API.isAdmin()){
        renderAdminPanel2();
      }
    };
  }
})();
// ===== 事件委托：修复全局作用域导致的 onClick 失效 =====
// 监听导航标签点击（防止因全局作用域问题导致内联 onclick 不触发）
document.querySelector('.nav-pill')?.addEventListener('click', function(e) {
  var btn = e.target.closest('.nav-tab');
  if (!btn) return;
  var target = btn.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
  if (target) { e.preventDefault(); window.selectTab(btn, target); }
});
// 监听登录按钮点击
document.querySelector('.nav-right')?.addEventListener('click', function(e) {
  var btn = e.target.closest('.nav-btn-secondary');
  if (!btn) return;
  e.preventDefault();
  if (typeof showLoginModal === 'function') showLoginModal();
});
// 监听「加入我们」「开始体验」「返回首页」等按钮
document.addEventListener('click', function(e) {
  // 处理导航类点击
  var tabBtn = e.target.closest('[onclick*="selectTab"]');
  if (tabBtn) {
    var match = tabBtn.getAttribute('onclick')?.match(/'([^']+)'/);
    if (match && typeof window.selectTab === 'function') {
      window.selectTab(tabBtn, match[1]);
    }
  }
  // 处理登录类点击
  var loginBtn = e.target.closest('[onclick*="showLoginModal"]');
  if (loginBtn && typeof showLoginModal === 'function') {
    showLoginModal();
  }
  // 处理跳转上传页点击（定价页"开始体验"、Hero"加入我们"等）
  var uploadBtn = e.target.closest('[onclick*="goToUpload"]');
  if (uploadBtn && typeof goToUpload === 'function') {
    e.preventDefault();
    goToUpload();
  }
  // 处理文件删除按钮（上传预览的 ×）
  if (e.target.closest('.up-file-remove')) {
    e.preventDefault();
    e.stopPropagation();
    if (typeof removeUploadedFile === 'function') removeUploadedFile();
  }
});

// 初始渲染定价卡片
renderPricingCards();
updateCodeBadge();

// ===== 意见箱表单提交 =====
(function(){
  var form=document.querySelector('.fb-form');
  if(!form)return;
  form.addEventListener('submit',function(e){
    e.preventDefault();
    var textarea=document.getElementById('feedbackText');
    var content=textarea.value.trim();
    if(!content){showToast('请输入反馈内容','error');return}
    var btn=form.querySelector('button[type="submit"]');
    btn.disabled=true;btn.textContent='提交中…';
    API.post('/api/feedback',{content:content}).then(function(){
      showToast('✅ 感谢你的反馈！','success');
      textarea.value='';
    }).catch(function(err){
      showToast('❌ '+(err.message||'提交失败'),'error');
    }).finally(function(){
      btn.disabled=false;btn.textContent='提交反馈';
    });
  });
})();
