# 渲染器直譯器身份

渲染器啟動准入會綁定獨立 Python 啟動器、實際執行嘅基底映像、Node
父程序、完整命令列、持有嘅程序身份同檔案雜湊。原始碼同證據路徑必須係
絕對、正規嘅普通檔案路徑，唔可以包含符號連結或者 junction。基底路徑有
重新導向時，目標啟動之前就會被拒絕。診斷時解析路徑，唔代表接受原本嘅
路徑寫法，亦唔會放寬原始碼或者證據檢查。

## 支援嘅執行環境復原方法

如果已安裝嘅獨立環境記錄咗一條會重新導向到另一實體位置嘅基底路徑，先用
`scripts/renderer-native-path.py` 獨立解析所選基底。呢個唯讀解析器會比較
原路徑同最終路徑持有嘅原生檔案身份、大小、寫入時間同雜湊。檢查結果中嘅
實體執行檔，然後用該執行檔支援嘅 `-m venv --without-pip` 操作，建立一個
由今次工作擁有嘅新獨立環境。唔好修改已安裝環境，亦唔好換成無關嘅
直譯器。透過支援嘅套件安裝器，喺新環境安裝可信嘅 Lowlevel 發行套件同
已審核、版本固定嘅相依套件。

透過 `MFE_LOWLEVEL_PYTHON` 同 `MFE_LOWLEVEL_CLI` 選取新環境嘅
`Scripts/python.exe` 同已註冊嘅 `Scripts/lowlevel-computer-use-cheap.exe`。
確認新設定指定實體基底、停用系統 site packages，並保留 console 同 GUI
執行檔。啟動 worker 仍然會核實實際執行嘅 GUI 映像、PE subsystem、設定中
存在嘅 console 同級執行檔、完整祖先鏈同全部雜湊。

## 唯讀準備檢查同限制

GUI 觀察器使用 `node scripts/renderer-binding-probe.mjs`；console 路線
就喺後面加 `console`。GUI 探針使用同正式啟動 worker 一樣嘅明確
`gui-observer` 角色。Console 探針保留普通嚴格角色。兩個探針都只觀察自身
直譯器鏈，唔會啟動目標，亦唔會產生執行驗收證據。必須讀取每個
`binding.json` 並要求 `ok: true`，唔可以只睇探針程序嘅退出結果。

針對性 Python 檢查繼續拒絕額外參數、改動過嘅命令、錯誤祖先鏈、console
同 GUI 互換、替換位元組，以及重新導向嘅證據。實際目標啟動、執行行為、
畫面擷取、還原同驗收，必須另外針對預定原始碼同建置執行。
