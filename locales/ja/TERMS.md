# 日本語：用語の決定

日本向けの標準語（ja-JP）。文章は「です・ます」、ボタンやラベルは短い名詞または動詞（建設、強化、受け取る）。ゲーム内では二人称代名詞（あなた、君、お前）を使わず、プレイヤー・他のプレイヤー・{name} を「彼」「彼女」で指さない（名前を繰り返す、「相手」を使う、主語を省く）。法務ページは「お客様」「当社」。新字体のみで、中国語の簡体字・繁体字は使わない（チェックで失敗する）。テキストは Unicode NFC。言語は端末の設定であり、ID、ルール、戦闘、プレイヤーが付けた名前やチャットは変わらない。

| English | 日本語 |
|---|---|
| Clan Keep / Keep / Keep 7 | 天守閣 / 天守閣（短：天守）/ 天守閣Lv.7 |
| Coin Mint / Terraced Farm | 小判鋳造所（短：鋳造所）/ 棚田 |
| Treasury / Provision Storehouse / storage | 金蔵 / 兵糧蔵 / 蔵 |
| Coins / Provisions / Shadow Ink / Jade | 小判（枚：小判500枚）/ 兵糧 / 影墨 / 翡翠（個）。兵糧と影墨は助数詞なし（兵糧500） |
| Training Dojo / Squad Courtyard | 修行道場（短：道場）/ 陣屋 |
| Village Artisan / Artisan's Hut | 村の職人 / 職人小屋 |
| Alliance / Alliance Lodge / Alliance War | 同盟 / 同盟会館 / 同盟戦 |
| Gang / Gang War / Gang leader | 徒党 / 徒党戦 / 徒党のリーダー |
| Friendly Duel / duel layout | フレンド手合わせ / 手合わせ用の配置 |
| Shadow Trials / tier | 影の試練 / 第N層（試練）、第N段（巻物） |
| Season Scroll / premium track / Pass (rail) | シーズン巻物 / プレミアム枠 / 巻物 |
| Smoke Bomb | 煙玉 |
| Saboteur / Sabotage / jam | 破壊工作員 / 破壊工作 / 妨害 |
| Infiltration Points | 潜入口 |
| Raid / attack / raider | 襲撃 / 攻撃 / 襲撃者 |
| Warrior / troops / Defense / Shield | 戦士（人）/ 戦士 / 防衛設備（基）/ シールド |
| Honor / Power / League | 名誉 / 戦力 / リーグ：竹、杉、鉄、黒曜、燠火、嵐、闇、影リーグ |
| Daily chest / streak / skip | 日替わり宝箱 / 連続記録 / 補填 |
| Clan Stipend | 一族の俸禄 |
| Looks / Keep look | 外観 / 天守閣の外観 |
| Research / Upgrade / Lv | 研究 / 強化 / Lv. |
| Tile / space (Courtyard) | マス / 枠 |
| Tempering (Reach / Blast / Watch) | 調律（射程 / 爆風 / 警戒） |
| Stake | 賭け |
| splash / anti-air | 範囲 / 対空 |
| generated (opponent, Gang) | 自動生成の |
| leader (player) / Leader / Elder / Member | 頭領 / リーダー / 長老 / メンバー |
| Village / Settings / Store | 村 / 設定 / ショップ |
| Online play / Sign-ins / Privacy and help | オンラインプレイ / サインイン方法 / プライバシーとヘルプ |
| moderators / staff / support | モデレーター / スタッフ / サポート |
| Deleted player | 削除されたプレイヤー |
| Codex | 図鑑 |
| Sensei Hoshi | ホシ先生 |
| Shinobi / Oni Breaker / Kage League | 忍 / 鬼砕き / 影リーグ（闇リーグと区別する） |

Kagemura: Ninja Clans は正式名称で、ラテン文字のまま翻訳しない。Apple、Google、Game Center、Play Games、App Store、Google Play、Sentry、IndexedDB などのブランドや技術名もそのまま。「Sign in with Apple」は Apple の日本語表記「Apple でサインイン」。

日本人の名前は漢字で書く（Kaito 海斗、Hana 花、Takeda 武田）。ライバルの一族の頭領：赤扇の茜、五郎翁、夜の尼。英語の異名は日本語の言葉に訳す。

複数形：日本語は `other` のみ。言い方が変わるときだけ `=1` を加える（返金、購入の復元）。数えるものには助数詞：人（戦士、プレイヤー）、棟（建物）、基（防衛設備）、個（星、翡翠、障害物）、枚（小判、手裏剣）、回（攻撃、強化、研究）、件（購入、メッセージ、操作）、層（試練）、段（巻物）、日。

空白：日本語の語句、数字、数字のプレースホルダーの間に空白を入れない（小判{n}枚、{n}人、天守閣Lv.{n}）。ラテン文字の単語やブランドの前後にだけ半角スペース（Game Center にサインイン、Kagemura を読み込めません）。日本語のテキストであるプレースホルダー（建物名、戦士名、プレイヤー名）の前後にも入れない（{building}を強化、{arg1}の村）。時間は {d}日{h}時間、{h}時間{m}分、{m}分{s}秒。

句読点：文中は全角（、。！？（）：）、かぎかっこ「」、書名・題名は『』、省略は……。ICU 構文、プレースホルダー、数字、ラテン文字の中は半角。英語で先頭に空白がある断片（チェックボックスのラベル）は、アイコンやチェックボックスと離す必要がある場合だけ空白を残す。日本語の文につながる断片では空白を取る。

生成される名前：地名とコンピューターの同盟名は2つの部分を空白なしでつなぐ（`generatedNames: "compound"`）：雷鳴 + 峰 = 雷鳴峰、双子 + 刃 = 双子刃、深夜 + 影 = 深夜影。前半は1〜2字の修飾語、後半は1〜2字の名詞で、どの組み合わせでも自然になるようにし、「の」は付けない。

実際の購入の価格はストアの表示に従う。米ドルの金額は米ドルのまま換算しない。サーバーの UTC 時刻は UTC のまま。

法務ページは草案の注記と、運営者がまだ公開していない情報を残す。翻訳によって条項が発効することはなく、運営者の確認の代わりにもならない。GDPR の用語（管理者、正当な利益、同意、標準契約条項）は一般的な日本語訳を使う。日本の法定ページ（特定商取引法に基づく表記、資金決済法に基づく表示）は、英語版に含まれる日本語の本文をそのまま使い、日本語版では英語の併記を外す。

REVIEW.json を参照：英語と同じ項目や、ラテン文字が多い項目を一覧にしており、すべて確認済みで、訳し漏れではない。この翻訳はまだ日本語のネイティブスピーカーによる確認を受けていない。
