// English and Hong Kong Cantonese copy for the animation and transition editor. The editor renders in the
// active language: English, Cantonese or both together.
export const MOTION_PROFILES_COPY = Object.freeze({
  'Animation and transitions': '動畫與過渡',
  'Tune every moving part. Changes apply live across the app.': '調校每個動態效果，變更會即時套用到整個程式。',
  'All animations': '所有動畫',
  'Speed': '速度',
  'Motion profile': '動態設定檔',
  'Calm': '平靜', 'Standard': '標準', 'Expressive': '豐富', 'Playful': '活潑', 'Edited': '已修改',
  'Save as profile': '另存為設定檔',
  'Profile name': '設定檔名稱',
  'Delete profile': '刪除設定檔',
  'Import JSON': '匯入 JSON',
  'Export JSON': '匯出 JSON',
  'Reset all': '全部重設',
  'Reset this kind': '重設此項',
  'Element kinds': '動畫類別',
  'Selected kind': '已選類別',
  'Enabled': '啟用',
  'Duration': '時長', 'Delay': '延遲', 'Stagger': '錯開', 'Distance': '距離', 'Scale': '縮放',
  'Easing': '緩動',
  'Easing curve': '緩動曲線',
  'Control point': '控制點',
  'Preview': '預覽',
  'Off': '關閉',
  'Advanced keyframe editor': '進階關鍵影格編輯器',
  'Open the advanced keyframe editor for the selected surface.': '為所選介面開啟進階關鍵影格編輯器。',
  'Windows asks for reduced motion, so nothing moves whatever is set here.': 'Windows 要求減少動態效果，因此無論此處如何設定都不會有動畫。',
  'The Motion setting is Reduced, so nothing moves whatever is set here.': '動態設定為「減少」，因此無論此處如何設定都不會有動畫。',
  'Low stimulation is on, so nothing moves whatever is set here.': '已開啟低刺激模式，因此無論此處如何設定都不會有動畫。',
  'Reduced motion always wins. Your profile is kept and applies again when it is off.': '減少動態效果永遠優先。你的設定檔會保留，並於關閉後再次套用。',
  'Motion profile applied.': '已套用動態設定檔。',
  'Motion profile saved.': '已儲存動態設定檔。',
  'Motion profile deleted.': '已刪除動態設定檔。',
  'Motion profile imported.': '已匯入動態設定檔。',
  'Motion profile exported.': '已匯出動態設定檔。',
  'Everything is back to the Expressive profile.': '已全部還原為「豐富」設定檔。',
  'Duration in milliseconds. Longer is slower.': '以毫秒計的時長，越長越慢。',
  'Wait before the motion starts, in milliseconds.': '動畫開始前的等待時間（毫秒）。',
  'Gap between neighbouring rows or cards, in milliseconds.': '相鄰列或卡片之間的間隔（毫秒）。',
  'How far the element travels while entering, in pixels.': '元素進場時移動的距離（像素）。',
  'Size at the start (or at the peak of a pulse). 1 is full size.': '起始（或脈動頂點）的大小，1 為原本大小。',
  'Turns this kind of motion on or off by itself.': '單獨開啟或關閉此類動畫。',
  'Multiplies every duration. 2 is twice as fast.': '倍增所有時長的快慢，2 代表快兩倍。',
  'Starting point and end point of the curve, on a 0 to 1 scale.': '曲線的起點與終點（0 至 1 的範圍）。',
  'Preview unavailable while motion is off.': '動畫關閉時無法預覽。',
  'Saved profiles': '已儲存的設定檔',
  'Show installation results as full-window messages': '以全螢幕訊息顯示安裝結果',
  'Turn this off to receive a notification instead of a full-window message.': '關閉後只會收到通知，不會顯示全螢幕訊息。'
});

/** Returns the label in the active language: English, Cantonese, or both together. */
export function motionText(language, english) {
  const yue = MOTION_PROFILES_COPY[english];
  if (!yue || language === 'en') return english;
  return language === 'yue' ? yue : `${english} · ${yue}`;
}

export function motionKindName(language, kind) {
  if (language === 'en') return kind.name;
  return language === 'yue' ? kind.yue : `${kind.name} · ${kind.yue}`;
}
