window.__ModuleLoader__.load({
  id: "dsh-auto-title",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    let react = require("react");
    let jsxRuntime = require("react/jsx-runtime");
    let jsx = jsxRuntime.jsx;
    let jsxs = jsxRuntime.jsxs;
    let useState = react.useState;
    let useSyncExternalStore = react.useSyncExternalStore;

    function createStore(init) {
      let state = init; const listeners = new Set();
      return { getSnapshot(){return state}, subscribe(fn){listeners.add(fn);return ()=>{listeners.delete(fn)}}, set(next){state=next;listeners.forEach(fn=>fn())} }
    }
    function useStore(store, selector){ return useSyncExternalStore(store.subscribe, ()=>selector(store.getSnapshot())) }

    function boolField(f){ return { field:f, format:(v)=>v===true?"true":"", parse:(t)=>{ const s=t.trim(); if(s==="true") return {kind:"set",value:true}; if(s==="") return {kind:"set",value:false}; return undefined } } }
    function textField(f){ return { field:f, format:(v)=>typeof v==="string"?v:"", parse:(t)=>{ const s=t.trim(); return s===""?{kind:"clear"}:{kind:"set",value:s} } } }
    function numberField(f){ return { field:f, format:(v)=>typeof v==="number"?String(v):"", parse:(t)=>{ const s=t.trim(); if(s==="") return {kind:"clear"}; const n=Number(s); return Number.isFinite(n)?{kind:"set",value:n}:undefined } } }

    function CardForm(scope, specs){
      this.scope=scope; this.specs=new Map(); specs.forEach((s)=>this.specs.set(s.field,s))
      this.staged=new Map(); this.listeners=new Set(); this.saving=false; this.failed=false
      const self=this; this._unsubscribe=scope.subscribe(()=>self.publish())
    }
    CardForm.prototype.bind=function(project){const self=this;const store=createStore(project());this.listeners.add(()=>store.set(project()));return store}
    CardForm.prototype.shell=function(){const snap=this.scope.getSnapshot();const plan=this.plan();return{available:snap.status==="ready",writable:snap.writable===true,dirty:plan.length>0,invalid:plan.some((i)=>i.run===undefined),saving:this.saving,failed:this.failed}}
    CardForm.prototype.field=function(field){const staged=this.staged.get(field);const spec=this.spec(field);if(staged===undefined) return{text:spec.format(this.sectionValue(field)),overridden:this.stored(field),invalid:false};const write=staged.clear?{kind:"clear"}:spec.parse(staged.text);return{text:staged.text,overridden:write!==undefined&&write.kind==="set",invalid:write===undefined}}
    CardForm.prototype.actions=function(){const self=this;return{edit:(f,t)=>self.stage(f,{text:t,clear:false}),resetField:(f)=>self.stage(f,{text:self.spec(f).format(self.baseValue(f)),clear:true}),save:()=>self.save(),discard:()=>{if(self.staged.size===0&&!self.failed) return;self.staged.clear();self.failed=false;self.publish()}}}
    CardForm.prototype.save=async function(){const plan=this.plan();const writes=[];plan.forEach((i)=>{if(i.run!==undefined) writes.push(i.run)});if(plan.length===0||this.saving||writes.length!==plan.length) return;this.saving=true;this.failed=false;this.publish();let ok=true;for(let i=0;i<writes.length;i++){if(!await writes[i]()) ok=false};if(ok) this.staged.clear();this.saving=false;this.failed=!ok;this.publish()}
    CardForm.prototype.plan=function(){const self=this;const plan=[];this.staged.forEach((staged,field)=>{const spec=self.spec(field);if(staged.clear){if(self.stored(field)) plan.push({field,run:()=>self.clear(field)});return};if(staged.text===spec.format(self.sectionValue(field))) return;const write=spec.parse(staged.text);if(write===undefined) plan.push({field,run:undefined});else if(write.kind==="clear") plan.push({field,run:()=>self.clear(field)});else plan.push({field,run:()=>self.store(field,write.value)})});return plan}
    CardForm.prototype.clear=async function(field){await this.scope.unset(field);return !this.stored(field)}
    CardForm.prototype.store=async function(field,value){await this.scope.set(field,value);const u=this.userLayer();return u!==undefined?u[field]===value:false}
    CardForm.prototype.stage=function(field,edit){this.staged.set(field,edit);this.failed=false;this.publish()}
    CardForm.prototype.spec=function(field){const s=this.specs.get(field);if(s===undefined) throw new Error("no such field: "+field);return s}
    CardForm.prototype.sectionValue=function(f){const v=this.snapshotOf().value;return v===undefined?undefined:v[f]}
    CardForm.prototype.baseValue=function(f){const b=this.snapshotOf().base;return b===undefined?undefined:b[f]}
    CardForm.prototype.userLayer=function(){return this.snapshotOf().user}
    CardForm.prototype.stored=function(f){const u=this.userLayer();return u!==undefined&&Object.prototype.hasOwnProperty.call(u,f)}
    CardForm.prototype.publish=function(){this.listeners.forEach(fn=>fn())}
    CardForm.prototype.snapshotOf=function(){return this.scope.getSnapshot()}

    const FIELD_KEYS=["enabled","provider","model","baseURL","apiKey","timeoutMs","targetWords","targetCjkCharacters","maxInputBytes","maxOutputTokens","fallbackMaxWords","fallbackMaxBytes","maxTitleBytes"]
    function AutoTitleController(scope){
      const self=this;
      this.form=new CardForm(scope,[
        boolField("enabled"),
        textField("provider"),
        textField("model"),
        textField("baseURL"),
        textField("apiKey"),
        numberField("timeoutMs"),
        numberField("targetWords"),
        numberField("targetCjkCharacters"),
        numberField("maxInputBytes"),
        numberField("maxOutputTokens"),
        numberField("fallbackMaxWords"),
        numberField("fallbackMaxBytes"),
        numberField("maxTitleBytes"),
      ]);
      this.store=this.form.bind(()=>self.projection())
    }
    AutoTitleController.prototype.projection=function(){
      const shell=this.form.shell();
      const r={};
      Object.keys(shell).forEach(k=>r[k]=shell[k]);
      FIELD_KEYS.forEach(k=>r[k]=this.form.field(k));
      return r
    }
    AutoTitleController.prototype.inject=function(){
      const a=this.form.actions();
      const r={hooks:{autoTitle:this.store}};
      Object.keys(a).forEach(k=>r[k]=a[k]);
      return r
    }

    let primitives = require("@deepseek-ai/dsh-client-ui-primitives");
    const css$2 = ".AT_field{flex-direction:column;gap:6px;padding:12px 0;display:flex}.AT_field+.AT_field{border-top:1px solid var(--dsw-alias-border-l2)}.AT_head{align-items:center;gap:8px;display:flex}.AT_label{min-width:0;color:var(--dsw-alias-label-primary);flex:1;font-size:13px;font-weight:500;line-height:1.5}.AT_badges{align-items:center;gap:8px;display:inline-flex}.AT_badge{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}.AT_reset{font:inherit;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;padding:0;font-size:12px;line-height:1.5}.AT_reset:hover:not(:disabled){color:var(--dsw-alias-label-primary)}.AT_input{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);height:34px;font:inherit;color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 12px;font-size:13px;line-height:1.5}.AT_input:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:none}.AT_input:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}.AT_inputInvalid{border-color:var(--dsw-alias-label-error)}.AT_invalid{color:var(--dsw-alias-label-error);margin:0;font-size:12px;line-height:1.5}.AT_hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}.AT_group{margin:0;padding:12px 16px 0;border-top:1px solid var(--dsw-alias-border-l2)}.AT_group:last-child{padding-bottom:8px}.AT_groupTitle{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:600;margin:8px 0 4px}";
    const tagId$2 = "dsh-auto-title/fields.module.css";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css="+JSON.stringify(tagId$2)+"]") === null) { const tag=document.createElement("style");tag.dataset.plugin="dsh-auto-title";tag.dataset.pluginCss=tagId$2;tag.textContent=css$2;document.head.appendChild(tag) }
    var fields_css = {"field":"AT_field","head":"AT_head","label":"AT_label","badges":"AT_badges","badge":"AT_badge","reset":"AT_reset","input":"AT_input","inputInvalid":"AT_inputInvalid","invalid":"AT_invalid","hint":"AT_hint","select":"AT_select","group":"AT_group","groupTitle":"AT_groupTitle"}

    const css$1 = ".AT_card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;list-style:none;transition:border-color .16s,background .16s}.AT_card:hover{border-color:var(--dsw-alias-label-dimmed)}.AT_cardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}.AT_header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}.AT_header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}.AT_headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}.AT_name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}.AT_desc{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}.AT_chev{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}.AT_chevOpen{transform:rotate(180deg)}.AT_body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px}.AT_readOnly{color:var(--dsw-alias-label-tertiary);margin:12px 0 0;font-size:12px;line-height:1.5}.AT_pending{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;flex:none;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}.AT_footer{border-top:1px solid var(--dsw-alias-border-l2);justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 4px;display:flex}.AT_failed{min-width:0;color:var(--dsw-alias-label-error);flex:1;margin:0;font-size:12px;line-height:1.5}.AT_discard,.AT_save{appearance:none;font:inherit;cursor:pointer;border:1px solid #0000;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5}.AT_discard{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:0 0}.AT_discard:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}.AT_save{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}.AT_discard:disabled,.AT_save:disabled{opacity:.4;cursor:default}.AT_discard:focus-visible,.AT_save:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}";
    const tagId$1 = "dsh-auto-title/PluginCard.module.css";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css="+JSON.stringify(tagId$1)+"]") === null) { const tag=document.createElement("style");tag.dataset.plugin="dsh-auto-title";tag.dataset.pluginCss=tagId$1;tag.textContent=css$1;document.head.appendChild(tag) }
    var card_css = {"card":"AT_card","cardOpen":"AT_cardOpen","header":"AT_header","headText":"AT_headText","name":"AT_name","desc":"AT_desc","chev":"AT_chev","chevOpen":"AT_chevOpen","body":"AT_body","readOnly":"AT_readOnly","pending":"AT_pending","footer":"AT_footer","failed":"AT_failed","discard":"AT_discard","save":"AT_save"}

    function r(e){var t,f,n="";if(typeof e==="string"||typeof e==="number") n+=e;else if(typeof e==="object") if(Array.isArray(e)){var o=e.length;for(t=0;t<o;t++) e[t]&&(f=r(e[t]))&&(n&&(n+=" "),n+=f)} else for(f in e) e[f]&&(n&&(n+=" "),n+=f);return n}
    function clsx(){for(var e,t,f=0,n="",o=arguments.length;f<o;f++) (e=arguments[f])&&(t=r(e))&&(n&&(n+=" "),n+=t);return n}

    function ValueField(props){
      const el = jsx("input", { id: props.id, className: props.invalid ? fields_css.inputInvalid : fields_css.input, type:"text", value: props.text, placeholder: props.placeholder||"", disabled: props.disabled, inputMode: props.numeric===true?"numeric":undefined, onChange:(e)=>props.onEdit(e.target.value) })
      return jsxs("div", { className: fields_css.field, children: [
        jsxs("div", { className: fields_css.head, children: [
          jsx("label", { className: fields_css.label, htmlFor: props.id, children: props.label }),
          props.overridden ? jsxs("span", { className: fields_css.badges, children: [
            jsx("span", { className: fields_css.badge, children: props.overriddenLabel }),
            jsx("button", { type:"button", className: fields_css.reset, disabled: props.disabled, onClick: props.onReset, children: props.resetLabel })
          ] }) : null
        ] }),
        el,
        jsx("p", { className: props.invalid ? fields_css.invalid : fields_css.hint, children: props.invalid ? props.invalidLabel : props.hint })
      ] })
    }

    function ToggleField(props){
      return jsxs("div", { className: fields_css.field, children: [
        jsxs("div", { className: fields_css.head, children: [
          jsx("label", { className: fields_css.label, htmlFor: props.id, children: props.label }),
          jsx("span", { className: fields_css.badge, children: props.checked ? props.onLabel : props.offLabel })
        ] }),
        jsx("label", { style: { display: "flex", alignItems: "center", gap: 8, cursor: props.disabled ? "default" : "pointer", color: props.disabled ? "var(--dsw-alias-label-tertiary)" : undefined }, children: [
          jsx("input", { type:"checkbox", id: props.id, checked: props.checked, disabled: props.disabled, onChange:(e)=>props.onChange(e.target.checked) }),
          jsx("span", { style: { fontSize: 13, lineHeight: 1.5 }, children: props.checked ? props.onLabel : props.offLabel })
        ] }),
        jsx("p", { className: fields_css.hint, children: props.hint })
      ] })
    }

    function PluginCard(props){
      const pair = useState(false); const open = pair[0]; const setOpen = pair[1]
      const state = props.state
      if (!state.available) return null
      const title = props.t(props.titleKey)
      const blocked = !state.dirty || state.invalid || state.saving
      return jsxs("li", { className: clsx(card_css.card, open && card_css.cardOpen), children: [
        jsxs("button", { type:"button", className: card_css.header, "aria-expanded": open, "aria-label": props.t(open?"collapse":"expand")+": "+title, onClick:()=>setOpen(!open), children: [
          jsxs("span", { className: card_css.headText, children: [ jsx("span",{className:card_css.name,children:title}), jsx("span",{className:card_css.desc,children:props.t(props.descriptionKey)}) ] }),
          state.dirty ? jsx("span", { className: card_css.pending, children: props.t("unsaved") }) : null,
          jsx(primitives.IconChevronDownOutline14, { className: clsx(card_css.chev, open && card_css.chevOpen) })
        ] }),
        open ? jsxs("div", { className: card_css.body, children: [
          !state.writable ? jsx("p", { className: card_css.readOnly, role:"status", children: props.t("readOnly") }) : null,
          props.children,
          jsxs("div", { className: card_css.footer, children: [
            state.failed ? jsx("p", { className: card_css.failed, role:"status", children: props.t("saveFailed") }) : null,
            jsx("button", { type:"button", className: card_css.discard, disabled: !state.dirty || state.saving, onClick: props.onDiscard, children: props.t("discard") }),
            jsx("button", { type:"button", className: card_css.save, disabled: blocked, onClick: props.onSave, children: jsx("span",{children: state.saving ? props.t("saving") : props.t("save")}) })
          ] })
        ] }) : null
      ] })
    }

    function FieldGroup(props){
      return jsxs("div", { className: fields_css.group, children: [
        props.title ? jsx("p",{className:fields_css.groupTitle,children:props.title}) : null,
        props.children
      ] })
    }

    function AutoTitleCard(props){
      const s = props.useAutoTitle(x=>x)
      const disabled = !s.writable
      const mkField = (key, label, hint, placeholder, numeric) => {
        const view = s[key]
        return jsx(ValueField, { id:"at-"+key, label, hint, placeholder, text: view.text, overridden: view.overridden, invalid: view.invalid, disabled, numeric, overriddenLabel: props.t("overridden"), resetLabel: props.t("reset"), invalidLabel: props.t("invalid"), onEdit:(text)=>props.edit(key,text), onReset:()=>props.resetField(key) })
      }
      const toggleView = s.enabled
      return jsx(PluginCard, { state:s, t:props.t, titleKey:"card.title", descriptionKey:"card.description", onDiscard:props.discard, onSave:props.save, children: jsxs("div",{children:[
        jsx(FieldGroup,{title:props.t("group.general"), children: jsx(ToggleField,{
          id:"at-enabled", label:props.t("field.enabled"), hint:props.t("hint.enabled"),
          checked: s.enabled.text==="true", disabled, onLabel:props.t("enabledOn"), offLabel:props.t("enabledOff"),
          onChange:(v)=>props.edit("enabled", v?"true":"")
        })}),
        jsx(FieldGroup,{title:props.t("group.model"), children: jsxs("div",{children:[
          mkField("provider", props.t("field.provider"), props.t("hint.provider"), "deepseek-official / openai"),
          mkField("model", props.t("field.model"), props.t("hint.model"), "deepseek-v4-flash"),
          mkField("baseURL", props.t("field.baseURL"), props.t("hint.baseURL"), "https://api.openai.com/v1"),
          mkField("apiKey", props.t("field.apiKey"), props.t("hint.apiKey"), "sk-..."),
          mkField("timeoutMs", props.t("field.timeoutMs"), props.t("hint.timeoutMs"), "15000", true),
        ]})}),
        jsx(FieldGroup,{title:props.t("group.prompt"), children: jsxs("div",{children:[
          mkField("targetWords", props.t("field.targetWords"), props.t("hint.targetWords"), "5", true),
          mkField("targetCjkCharacters", props.t("field.targetCjkCharacters"), props.t("hint.targetCjkCharacters"), "10", true),
          mkField("maxInputBytes", props.t("field.maxInputBytes"), props.t("hint.maxInputBytes"), "4096", true),
          mkField("maxOutputTokens", props.t("field.maxOutputTokens"), props.t("hint.maxOutputTokens"), "64", true),
        ]})}),
        jsx(FieldGroup,{title:props.t("group.fallback"), children: jsxs("div",{children:[
          mkField("fallbackMaxWords", props.t("field.fallbackMaxWords"), props.t("hint.fallbackMaxWords"), "8", true),
          mkField("fallbackMaxBytes", props.t("field.fallbackMaxBytes"), props.t("hint.fallbackMaxBytes"), "60", true),
          mkField("maxTitleBytes", props.t("field.maxTitleBytes"), props.t("hint.maxTitleBytes"), "80", true),
        ]})}),
      ]}) })
    }

    const NS = "auto-title"
    const zh = {
      "card.title":"会话自动标题（auto-title）",
      "card.description":"对标 Hermes：新会话首问截取首句为临时标题，首轮问答结束后异步调用独立模型生成正式标题，过滤 think 标签，每会话仅一次，手动改名后不再覆盖。",
      "unsaved":"未保存", "expand":"展开", "collapse":"收起",
      "save":"保存", "saving":"保存中…", "discard":"放弃",
      "saveFailed":"保存未生效，请检查填写内容",
      "readOnly":"该设置为只读（当前连接不可写）",
      "overridden":"已覆盖", "reset":"重置", "invalid":"请输入有效值",
      "group.general":"总开关",
      "group.model":"辅助模型",
      "group.prompt":"标题生成",
      "group.fallback":"截取与上限",
      "field.enabled":"启用自动标题",
      "hint.enabled":"关闭后不再自动生成任何标题，仅保留已有标题",
      "enabledOn":"已启用", "enabledOff":"已禁用",
      "field.provider":"辅助 Provider",
      "hint.provider":"留空则跟随会话主对话模型；填入则使用独立模型（如 deepseek-official、tokenrouter）",
      "field.model":"辅助 Model",
      "field.baseURL":"辅助 Base URL",
      "field.apiKey":"辅助 API Key",
      "hint.model":"与 Provider 配对；留空则跟随主模型",
      "hint.baseURL":"独立服务的 OpenAI 兼容 Base URL，留空则跟随主模型服务商；如 https://api.tokenrouter.com/v1",
      "hint.apiKey":"独立服务的 API Key，留空则跟随主模型鉴权；与 baseURL+model 配合实现完全独立",
      "field.timeoutMs":"生成超时（毫秒）",
      "hint.timeoutMs":"LLM 标题生成的超时，默认 15000；超时则保留临时截取标题",
      "field.targetWords":"目标英文词数",
      "hint.targetWords":"非 CJK 语言的目标词数，默认 5",
      "field.targetCjkCharacters":"目标 CJK 字数",
      "hint.targetCjkCharacters":"中文/日韩等目标字符数，默认 10",
      "field.maxInputBytes":"输入截断字节",
      "hint.maxInputBytes":"送给标题模型的用户+助手上下文上限，默认 4096",
      "field.maxOutputTokens":"最大输出 Token",
      "hint.maxOutputTokens":"标题模型最大输出，默认 64",
      "field.fallbackMaxWords":"截取最大词数",
      "hint.fallbackMaxWords":"前端/后端截取临时标题的最大词数，默认 8",
      "field.fallbackMaxBytes":"截取最大字节",
      "hint.fallbackMaxBytes":"截取临时标题的 UTF-8 字节上限，默认 60",
      "field.maxTitleBytes":"标题最大字节",
      "hint.maxTitleBytes":"正式标题的 UTF-8 字节上限，默认 80",
    }
    const en = {
      "card.title":"Auto Title (auto-title)",
      "card.description":"Hermes-aligned: fallback from first sentence instantly, then async LLM title after first round, think-tag filtered, once per session, respects user rename.",
      "unsaved":"Unsaved", "expand":"Expand", "collapse":"Collapse",
      "save":"Save", "saving":"Saving…", "discard":"Discard",
      "saveFailed":"Save did not land; check your input",
      "readOnly":"Read-only (not writable over the current connection)",
      "overridden":"Overridden", "reset":"Reset", "invalid":"Enter a valid value",
      "group.general":"General",
      "group.model":"Auxiliary Model",
      "group.prompt":"Generation",
      "group.fallback":"Fallback & Limits",
      "field.enabled":"Enable auto title",
      "hint.enabled":"When disabled, no automatic titles will be generated.",
      "enabledOn":"Enabled", "enabledOff":"Disabled",
      "field.provider":"Auxiliary Provider",
      "hint.provider":"Empty follows the session's main provider; set to use an independent model.",
      "field.model":"Auxiliary Model",
      "field.baseURL":"Auxiliary Base URL",
      "field.apiKey":"Auxiliary API Key",
      "hint.model":"Paired with provider; empty follows main model.",
      "hint.baseURL":"OpenAI-compatible Base URL for independent service; empty follows main. e.g. https://api.tokenrouter.com/v1",
      "hint.apiKey":"API Key for independent service; empty follows main. Use with baseURL+model for fully independent",
      "field.timeoutMs":"Timeout (ms)",
      "hint.timeoutMs":"LLM title generation timeout, default 15000; fallback kept on timeout.",
      "field.targetWords":"Target words",
      "hint.targetWords":"Target words for non-CJK, default 5",
      "field.targetCjkCharacters":"Target CJK chars",
      "hint.targetCjkCharacters":"Target characters for CJK, default 10",
      "field.maxInputBytes":"Max input bytes",
      "hint.maxInputBytes":"User+assistant context budget, default 4096",
      "field.maxOutputTokens":"Max output tokens",
      "hint.maxOutputTokens":"Max tokens for title model, default 64",
      "field.fallbackMaxWords":"Fallback max words",
      "hint.fallbackMaxWords":"Fallback title word cap, default 8",
      "field.fallbackMaxBytes":"Fallback max bytes",
      "hint.fallbackMaxBytes":"Fallback title byte cap, default 60",
      "field.maxTitleBytes":"Max title bytes",
      "hint.maxTitleBytes":"Final title byte cap, default 80",
    }

    // ---------- 前端乐观标题（对标 Hermes 首句截取） ----------
    function cleanTitleText(input){
      return input
        .replace(/(?:\x1B\]|\x9D)(?:(?!\x07|\x1B\\)[\s\S])*(?:\x07|\x1B\\|$)/gu, '')
        .replace(/(?:\x1B\[|\x9B)[0-?]*[ -/]*[@-~]/gu, '')
        .replace(/\x1B[@-_]/gu, '')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/gu, '')
        .replace(/[\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/gu, '')
        .replace(/\s+/gu, ' ').trim()
    }
    function truncateUtf8(input, maxBytes){
      if (new TextEncoder().encode(input).length <= maxBytes) return input
      let used=0, out=""
      for (const ch of input){
        const b=new TextEncoder().encode(ch).length
        if (used+b>maxBytes) break
        out+=ch; used+=b
      }
      return out
    }
    function fallbackTitle(input, maxWords, maxBytes){
      const words=cleanTitleText(input).split(' ').filter(Boolean).slice(0,maxWords)
      return truncateUtf8(words.join(' '), maxBytes).trimEnd()
    }
    function firstSentence(text){
      const m=text.match(/^[^。！？!?\n]+[。！？!?]?/)
      return m?m[0]:text
    }
    function computeFallback(text, cfg){
      const sentence=firstSentence(text)
      const maxW=cfg.fallbackMaxWords||8
      const maxB=cfg.fallbackMaxBytes||60
      const maxTitle=cfg.maxTitleBytes||80
      const fb=fallbackTitle(sentence, maxW, maxB)
      return truncateUtf8(fb, maxTitle)
    }

    function installOptimistic(){
      if (typeof document==="undefined" || typeof window==="undefined") return
      if (window.__dshAutoTitleInstalled) return
      window.__dshAutoTitleInstalled=true

      // 读取最新配置（从 settingsScope 快照会被 React 控，这里直接取默认值+覆盖）
      function getCfg(){
        try{
          // 尝试从 window.__DSH_SETTINGS 读取？降级用默认
          return { fallbackMaxWords:8, fallbackMaxBytes:60, maxTitleBytes:80 }
        }catch{ return { fallbackMaxWords:8, fallbackMaxBytes:60, maxTitleBytes:80 } }
      }

      function applyOptimistic(text){
        try{
          const title=computeFallback(text, getCfg())
          if(!title) return
          // 仅在会话列表区域内寻找“新会话”占位，严格排除“新建会话”按钮
          const region = document.querySelector('.hHd-Xa_regionArea') || document.querySelector('[class*="regionArea"]') || document.querySelector('aside') || document.body
          const candidates = []
          region.querySelectorAll('*').forEach(el=>{
            if(el.children.length!==0) return
            if(!el.textContent || el.textContent.trim()!=="新会话") return
            // 严格排除新建会话按钮：其最近的 button 祖先带有 hHd-Xa_newSession 或位于 logoRow
            const btn = el.closest('button')
            if(btn){
              const cls = btn.className || ""
              if(typeof cls==="string" && cls.includes("hHd-Xa_newSession")) return
              if(typeof cls==="string" && cls.includes("hHd-Xa_logoRow")) return
              if(btn.closest && btn.closest('.hHd-Xa_logoRow')) return
              if(btn.closest && btn.closest('.hHd-Xa_newSession')) return
            }
            // 排除侧边栏头部区域的按钮文本，仅保留列表项
            if(el.closest && el.closest('.hHd-Xa_root') && el.closest('.hHd-Xa_logoRow')) return
            const rect=el.getBoundingClientRect()
            if(rect.width===0 || rect.height===0) return
            candidates.push(el)
          })
          // 若在列表区域未找到，尝试全局但仍排除新建按钮
          if(candidates.length===0){
            document.querySelectorAll('*').forEach(el=>{
              if(el.children.length!==0) return
              if(!el.textContent || el.textContent.trim()!=="新会话") return
              const btn = el.closest && el.closest('button')
              if(btn){
                const cls = btn.className || ""
                if(typeof cls==="string" && cls.includes("hHd-Xa_newSession")) return
                if(btn.closest && btn.closest('.hHd-Xa_newSession')) return
                if(btn.querySelector && btn.querySelector('svg')) return
              }
              candidates.push(el)
            })
            // 若仅剩新建按钮本身，不处理
            if(candidates.length===1){
              const onlyBtn = candidates[0].closest && candidates[0].closest('button')
              if(onlyBtn && onlyBtn.className && String(onlyBtn.className).includes("hHd-Xa_newSession")) return
            }
          }
          if(candidates.length===0) return
          // 优先替换列表中第一个非按钮的“新会话”会话项
          for(const el of candidates){
            el.textContent=title
            el.setAttribute('title', title)
            break
          }
        }catch(e){ /* silent */ }
      }

      // 策略1：拦截 textarea 回车 / 发送按钮
      function hookComposer(){
        // 监听全局发送事件
        document.addEventListener('keydown', (e)=>{
          if(e.key==="Enter" && !e.shiftKey && !e.isComposing){
            const target=e.target
            if(target && (target.tagName==="TEXTAREA" || target.getAttribute("contenteditable")==="true")){
              const text = target.value || target.textContent || ""
              if(text && text.trim()){
                // 延迟一点让 DSH 先处理，乐观更新在此刻触发，视觉上“立刻”
                setTimeout(()=>applyOptimistic(text), 10)
              }
            }
          }
        }, true)
        document.addEventListener('click', (e)=>{
          const btn=e.target && e.target.closest && e.target.closest('button')
          if(!btn) return
          // 启发式：发送按钮通常含 aria-label "发送" 或 svg 箭头
          const label=(btn.getAttribute('aria-label')||"").toLowerCase()
          if(label.includes("发送") || label.includes("send") || btn.innerHTML.includes("IconSend")){
            const textarea=document.querySelector('textarea')
            const text=textarea && (textarea.value||"")
            if(text && text.trim()){
              setTimeout(()=>applyOptimistic(text), 10)
            }
          }
        }, true)
      }

      // 策略2：MutationObserver 监听新用户消息气泡，提取首句做标题
      function hookMessageObserver(){
        const obs=new MutationObserver((mutations)=>{
          for(const m of mutations){
            for(const node of m.addedNodes){
              if(!(node instanceof HTMLElement)) continue
              const text=node.textContent||""
              // 粗略判断用户消息：可根据 role 标记，但这里用启发式
              if(node.matches && node.matches('[data-role="user"], [data-message-role="user"]')){
                if(text.trim()) applyOptimistic(text)
              }
            }
          }
        })
        // 观察对话区域
        const start=()=>{
          const root=document.querySelector('main')||document.body
          if(root) obs.observe(root, {childList:true, subtree:true})
        }
        if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", start)
        else start()
      }

      hookComposer()
      hookMessageObserver()
    }

    const inject = ["slots","locale","settingsScope"]
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), "auto-title: dictionaries")
      const scope = ctx.settingsScope.bind({ namespace: NS })
      const controller = new AutoTitleController(scope)
      ctx.slots.inject("settings.plugin.item", function* () {
        yield ctx.slots.register({ name:"settings.plugin.item", key: NS, locale: NS, inject: () => controller.inject() }, AutoTitleCard)
      })
      // 乐观标题钩子（前端立刻截取）
      try{ installOptimistic() }catch{}
      // 也在页面已加载后再次确保钩子
      if(typeof window!=="undefined"){
        if(document.readyState==="complete") setTimeout(()=>{try{installOptimistic()}catch{}}, 500)
        else window.addEventListener("load", ()=>{try{installOptimistic()}catch{}})
      }
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  }
});