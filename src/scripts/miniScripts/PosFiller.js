
/*
 * to fill coords in the chat, customizable
 * keywords:
 *  pos: player block pos
 *  bpos: looking at block pos
 * add a comma (,) to separate with comma
 * 
 * is service script
 */

if (!World.isWorldLoaded()) JsMacros.waitForEvent('ChunkLoad')

let block
/** @type {SuggestingListener[]} */
const listeners = [
  { // bpos: block pos
    onOpenChatScreen() {
      block = Player.rayTraceBlock(8, false)
    },
    onKeyword(keyword, sym) {
      if (keyword !== 'bpos') return
      if (!(block ||= Player.rayTraceBlock(8, false))) return
      if (sym === ',') return `${block.getX()}, ${block.getY()}, ${block.getZ()}`
      if (sym === '')  return `${block.getX()} ${block.getY()} ${block.getZ()} `
    }
  },
  { // pos: player pos
    onKeyword(keyword, sym) {
      Chat.log(keyword)
      if (keyword !== 'pos') return
      const pos = Player.getPlayer().getPos()
      const x = Math.floor(pos.x)
      const y = Math.floor(pos.y)
      const z = Math.floor(pos.z)
      if (sym === ',') return `${x}, ${y}, ${z}`
      if (sym === '')  return `${x} ${y} ${z} `
    }
  },
  { // cpos: camera pos
    onKeyword(keyword, sym) {
      if (keyword !== 'cpos') return
      const cam = Client.getMinecraft().field_1773.method_19418().method_19326() // .gameRenderer.getCamera().getPos()
      const x = Math.floor(cam.field_1352)
      const y = Math.floor(cam.field_1351)
      const z = Math.floor(cam.field_1350)
      if (sym === ',') return `${x}, ${y}, ${z}`
      if (sym === '')  return `${x} ${y} ${z} `
    }
  },
  { // caps convert to lower case
    onChange(text, cursor) {
      text = text.slice(0, cursor)
      if (/[A-Z]/.test(text) && /^[A-Z ,.!?]+$/.test(text))
        return new Suggestion(0, cursor, text.toLowerCase())
    }
  },
  // { // test: multiple string range is supported
  //   onChange(s, c) {
  //     s = s.slice(0, c)
  //     const res = []
  //     let l = Math.floor(s.length / 4)
  //     while (l > 0) {
  //       res.push(new Suggestion(c - l * 4, c, 'Test'.repeat(l--)))
  //     }
  //     return res
  //   }
  // },
  // { // test: will suggest after picked a suggest
  //   onKeyword(k) {
  //     if (k === 'pos') return 'bpos'
  //   }
  // }
]

/*
 * setup class strings
 * here so forge and fabric will work with the same script
*/

let InputC, InputCF, SuggestorWindowC, SuggestorWindowCF, SuggestionWindowC, ChatFieldCF, ChangedListenerC, ChangedListenerCF, TextWidth1, TextWidth2, ISMethod

if (Client.mcVersion().includes("fabric")) {
    InputC = 'net.minecraft.class_408'
    InputCF = 'field_21616'
    SuggestorWindowC = 'net.minecraft.class_4717'
    SuggestorWindowCF = 'field_21612'
    SuggestionWindowC = 'net.minecraft.class_4717$class_464'
    ChatFieldCF = 'field_2382'
    ChangedListenerC = 'net.minecraft.class_342'
    ChangedListenerCF = 'field_2088'
    TextWidth1 = 'field_1772'
    TextWidth2 = 'method_1727'
    ISMethod = 'method_23933'
} else {   
    InputC = 'net.minecraft.client.gui.screens.ChatScreen'
    InputCF = 'f_95577_'
    SuggestorWindowC = 'net.minecraft.client.gui.components.CommandSuggestions'
    SuggestorWindowCF = 'f_93866_'
    SuggestionWindowC = 'net.minecraft.client.gui.components.CommandSuggestions$SuggestionsList'
    ChatFieldCF = 'f_95573_'
    ChangedListenerC = 'net.minecraft.client.gui.components.EditBox'
    ChangedListenerCF = 'f_94089_'
    TextWidth1 = 'f_91062_'
    TextWidth2 = 'm_92895_'
    ISMethod = 'm_93922_'
}

/** @type {OpenChatScreenListener[]} */
const onOpenChatScreens = []
/** @type {ChangeListener[]} */
const onChanges = []
/** @type {KeywordListener[]} */
const onKeywords = []
listeners.forEach(l => {
  if (l.onOpenChatScreen) onOpenChatScreens.push(l.onOpenChatScreen)
  if (l.onChange) onChanges.push(l.onChange)
  if (l.onKeyword) onKeywords.push(l.onKeyword)
})

const StringRange = Java.type('com.mojang.brigadier.context.StringRange')
const mcSuggestion = Java.type('com.mojang.brigadier.suggestion.Suggestion')
const InputSuggestorF  = getF(Java.type(InputC),  InputCF)
const suggestorWindowF = getF(Java.type(SuggestorWindowC), SuggestorWindowCF)
const SuggestionWindow = getF(Java.type(SuggestionWindowC).class.getDeclaredConstructors()[0])
const chatFieldF       = getF(Java.type(InputC),  ChatFieldCF)
const changedListenerF = getF(Java.type(ChangedListenerC),  ChangedListenerCF)

/** @type {(text: string) => number} */
const getTextWidth = Client.getMinecraft()[TextWidth1][TextWidth2]

let currentText = ''

JsMacros.on('OpenScreen', JavaWrapper.methodToJava(e => {
  if (e.screenName !== 'Chat') return
  onOpenChatScreens.forEach(cb => cb(e.screen))
  new Promise((res, rej) => {
    e.screen.setOnKeyPressed(JavaWrapper.methodToJava(res))
    e.screen.setOnClose(JavaWrapper.methodToJava(rej))
  }).then(() => {
    if (Hud.getOpenScreenName() !== 'Chat') return
    const screen = Hud.getOpenScreen()
    const input = chatFieldF.get(screen)

    // i sure hope this message won't appear anymore COPIUM
    if (!input) return Chat.log(`[PosFiller err] null input in class ${screen.getClass()}`)
    const composed = changedListenerF.get(input)?.andThen(JavaWrapper.methodToJava(text => {
      triggerSuggest(screen, input, text)
    }))
    
    if (composed) input.method_1863(composed) // input.setChangedListener()
    else Chat.log('[PosFiller err] null composed')
  })
}))

/**
 * @param {IScreen} screen 
 * @param {?} input 
 * @param {string} text 
 */
function triggerSuggest(screen, input, text) {
  currentText = text
  const cursor = input.method_1881()
  const keywordMatch = text.slice(0, cursor).match(/\$?\b(\w+)(\W*)$/)

  /** @type {Suggestion[]} */
  const res = onChanges.flatMap(cb => cb(text, cursor))
    .filter(/** @type {Filter<Suggestion>} */ (s => s instanceof Suggestion))
    .filter(s => !s.discard)
  if (keywordMatch) {
    const [, keyword, sym] = keywordMatch
    const kres = onKeywords.flatMap(cb => cb(keyword, sym))
      .filter(/** @type {Filter<string>} */ (v => typeof v === 'string'))
    if (kres.length) {
      const start = keywordMatch.index ?? 0
      const end = start + keywordMatch[0].length
      res.push(...kres.map(s => new Suggestion(start, end, s)).filter(s => !s.discard))
    }
  }

  if (!res.length) return

  /** @type {JavaList<mcSuggestion>} */
  // @ts-ignore
  const list = new (Java.type('java.util.ArrayList'))()
  /** @type {number} */// @ts-ignore
  const start = res.reduce((p, v) => p < v.start ? p : v.start, Infinity)
  let maxWidth = 0
  res.forEach(s => {
    const sug = text.slice(start, s.start) + s.text
    list.add(new mcSuggestion(StringRange.between(start, s.end), sug))
    const wid = getTextWidth(sug)
    if (wid > maxWidth) maxWidth = wid
  })
  if (!maxWidth) return

  const InputSuggestor = InputSuggestorF.get(screen)
  suggestorWindowF.set(InputSuggestor, SuggestionWindow.newInstance(
    InputSuggestor,
    getTextWidth(text.slice(0, start)) + 4, // x
    screen.getHeight() - 12, // y
    maxWidth,
    list,
    false // narrateFirstSuggestion
  ))
  InputSuggestor[ISMethod](true) // .setWindowActive()
}

/**
 * @param {number} start
 * @param {number} end
 * @param {string} text
 */
function Suggestion(start, end, text) {
  this.discard = false
  const discard = (/** @type {string} */ msg) => {
    if (msg != null) Chat.log(`[PosFiller] ${msg}`)
    this.discard = true
  }
  if (typeof start !== 'number') return discard(`wrong type on start (${start})`)
  if (typeof end   !== 'number') return discard(`wrong type on end (${end})`)
  if (typeof text  !== 'string') return discard(`wrong type on text (${text})`)
  if (start < 0 || start >= currentText.length) return discard(`invalid range of start (${start})`)
  if (end < 0 || end > currentText.length) return discard(`invalid range of end (${end})`)
  /** @type {number} */ this.start = start
  /** @type {number} */ this.end = end
  /** @type {string} */ this.text = text
}

/**
 * @template {JavaClassArg | AccessibleObject} T
 * @param {T} f 
 * @param {T extends JavaClassArg ? string : undefined} [name] 
 * @returns {T extends JavaClassArg ? Field : T}
 */
function getF(f, name) {
  if (name) f = Reflection.getDeclaredField(f, name)
  f.setAccessible(true)
  return f
}

/**
 * @typedef {object} SuggestingListener
 * @property {OpenChatScreenListener} [onOpenChatScreen]
 *  might call 2 times with optifine installed, not sure
 * @property {ChangeListener} [onChange]
 * @property {KeywordListener} [onKeyword]
 */

/**
 * @typedef {(screen: IScreen) => void} OpenChatScreenListener
 * @typedef {(text: string, cursor: number) => void | Suggestion | Suggestion[]} ChangeListener
 * @typedef {(keyword: string, symbols: string) => void | string | string[]} KeywordListener
 */

/**
 * @typedef {Packages.xyz.wagyourtail.jsmacros.client.api.sharedinterfaces.IScreen} IScreen
 * @typedef {Packages.com.mojang.brigadier.suggestion.Suggestion} mcSuggestion
 * @typedef {Packages.java.lang.reflect.Field} Field
 * @typedef {Packages.java.lang.reflect.AccessibleObject} AccessibleObject
 */

module.exports = {}
