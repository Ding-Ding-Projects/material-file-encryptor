import {buildSurfaceInventory} from './info-icon-inventory.js';

/**
 * Information icons for the Split storage page. The page renders inside its own shadow root, so the icons are
 * mounted on that root by src/renderer/features/split-storage/info-icons.js. Selectors are plain ids that the
 * page assigns when it builds the control.
 */
const rows = [
  ['#split-safety', 'toggle', 'Safety backup', '安全備份',
    'Keep every part on the main disk until each new copy has been copied and verified. Only then is space on the main disk released.', '分散完成前，所有分段都保留喺主磁碟；每個新副本複製並驗證成功後，先會釋放主磁碟空間。',
    'On, a failed copy or an unplugged USB drive leaves all your files on the main disk. Turning it off asks you to confirm because the main disk then stops holding a full copy during the split.', '開啟時，複製失敗或者 USB 被拔走，所有檔案都會留喺主磁碟。關閉要先確認，因為之後分散期間主磁碟唔再有完整副本。',
    {default: ['On', '開'], runtime: true}],
  ['#split-copies', 'number', 'Copies of each part', '每個分段嘅副本數',
    'Choose how many different locations hold each encrypted part. One means split only; two or more adds redundancy.', '揀每個加密分段存放喺幾多個不同位置；1 代表只分散，2 或以上有額外副本。',
    'With one copy, every location that holds a share is needed to open the files stored on it. More copies need more space.', '只有 1 個副本時，打開存放喺某位置嘅檔案就一定要連接嗰個位置；多副本要用更多空間。',
    {min: 1, max: 16, sample: 1, integer: true, default: ['1', '1'], runtime: true}]
];

export const SPLIT_STORAGE_INFO_ICON_INVENTORY = buildSurfaceInventory('split-storage', rows, []);
