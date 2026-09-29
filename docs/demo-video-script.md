# Planwise: kịch bản quay video demo

Video dài khoảng **10–12 phút**, gồm 12 cảnh. Mỗi cảnh có 4 phần: **Mục đích**, **Thao tác** (làm theo thứ tự), **Lời thoại gợi ý** (tiếng Anh, sửa lại tuỳ khách hàng) và **Lưu ý**. Nếu cần bản ngắn khoảng 3 phút, xem mục cuối.

Toạ độ ghi dạng `(x, y) m` là toạ độ trên bản vẽ; khi rê chuột, thanh trạng thái phía dưới sẽ hiện toạ độ này.

---

## Chuẩn bị trước khi quay

1. Chạy app: `yarn dev`, mở `http://localhost:5173` bằng **Chrome**.
2. Cửa sổ trình duyệt **1440 × 900** (tối thiểu 1200 px chiều ngang), zoom trình duyệt **100%**. Ẩn thanh bookmark, đóng DevTools, tắt thông báo hệ điều hành.
3. **Reset về demo sạch:** bấm logo **Planwise** → **Open demo · Harbor St. Residence** → **Open demo**. Làm như vậy trước mỗi lần quay lại (mỗi "take").
4. **Chạy thử một lượt Export PDF** trước khi quay. Lần đầu app phải tải thư viện PDF và font, nên sẽ chậm một chút.
5. Đóng các tab nặng khác để số FPS ở cảnh Performance đẹp.
6. Thói quen khi quay: **rê chuột chậm**, dừng khoảng 1 giây sau mỗi thao tác. Tooltip trên thanh công cụ trái chỉ hiện sau 0.3 giây.

**Phím cần nhớ**

| Phím | Tác dụng |
|---|---|
| `V` / `H` | Select / Hand |
| `W` / `D` / `O` / `F` / `E` | Wall / Door / Window / Furniture / Electrical |
| `T` / `L` / `M` / `N` / `R` | Text / Dimension / Measure / Note / Revision cloud |
| `⌘Z`, `⌘⇧Z` | Undo, Redo |
| `⌘G`, `⇧⌘G` | Group, Ungroup |
| `⌘K` | Tìm trong Library |
| `Space` + kéo | Pan (dùng được ở mọi tool) |
| `⌘` + lăn chuột | Zoom |
| `Esc` | Huỷ thao tác / quay về Select |

---

## Cảnh 1: Mở đầu (≈ 30 giây)

**Mục đích:** cho khách thấy toàn cảnh editor và nói rõ điểm khác biệt: vẽ bằng Canvas 2D thuần.

**Thao tác**
1. Để yên màn hình demo *Harbor St. Residence — Unit 4B* khoảng 3 giây.
2. Rê chuột lần lượt qua: thanh công cụ trái → bảng Layers → canvas → panel Properties → thanh trạng thái.
3. Rê lên vài nút trên thanh công cụ trái để tooltip hiện tên, phím tắt và cách dùng.

**Lời thoại gợi ý**
> "This is Planwise, a floor plan editor built directly on the raw Canvas 2D API — no Fabric, no Konva, no game engine. Rendering, hit detection and input handling are all ours, which is why it stays fast and precise."

**Lưu ý:** thanh trạng thái có sẵn dòng `Canvas 2D · rAF loop` và số FPS, nên nhắc tới luôn.

---

## Cảnh 2: Điều hướng (≈ 30 giây)

**Mục đích:** zoom và pan mượt; thước đo, lưới và tỉ lệ đều theo mét.

**Thao tác**
1. `⌘` + lăn chuột để zoom quanh con trỏ, rồi bấm `−` và `+` trên topbar.
2. Giữ `Space` rồi kéo để pan.
3. Chỉ vào thước đo, lưới, mũi tên la bàn và thanh tỉ lệ (`SCALE 1:50`, thay đổi theo mức zoom).
4. Zoom về **100%**.

**Lời thoại gợi ý**
> "Everything is stored in real-world metres. The rulers, grid, and scale bar all update live as you zoom."

---

## Cảnh 3: Chọn và biến đổi (≈ 1 phút)

**Mục đích:** các handle, xoay có bắt góc, ô nhập số chính xác, snap.

**Thao tác**
1. Click **giường** (Bed — King, khoảng `(2.4, 6.4) m` trong phòng ngủ).
2. Kéo **núm xoay** phía trên giường để thấy góc bắt theo bước 15°, kèm nhãn độ.
3. Kéo một **handle góc** để đổi kích thước, kèm nhãn `W × H`.
4. Trong Properties, gõ vào ô **R** (ví dụ `45`) rồi Enter. Bấm **Flip horizontal**, sau đó **Flip vertical**.
5. Kéo **bàn cà phê** lại gần sofa để thấy đường smart guide màu cam bắt vào cạnh hoặc tâm.
6. `⌘Z` vài lần để hoàn tác.

**Lời thoại gợi ý**
> "Selection, rotate with angle snapping, resize, exact numeric fields, flips. Smart guides snap to edges and centres of nearby objects. And every drag is a single undoable command."

---

## Cảnh 4: Hit detection và chọn nhiều (≈ 1 phút 15 giây)

**Mục đích:** chọn chính xác theo đa giác, không theo khung chữ nhật bao quanh. Đây là điểm kỹ thuật nổi bật nhất.

**Thao tác**
1. Click vào chỗ trống cho bỏ chọn. Trong Properties → **Hit detection**, bật **Show hit regions** và **Show broadphase grid**.
2. Rê chuột qua **sofa chữ L** để thấy lưới 2 m và các đa giác được thử.
3. Click vào **góc trống bên trong chữ L** (khoảng `(1.6, 3.05) m`). **Tấm thảm** bên dưới được chọn, không phải sofa.
4. Đổi **Test mode** sang **Bounding box** và click lại đúng chỗ đó: lần này sofa "cướp" click. Đổi lại về **Point-in-polygon** và tắt 2 công tắc debug.
5. Kéo một khung chọn (marquee) quanh vài món đồ; giữ `Alt` khi kéo để chuyển sang chế độ **Contain**.
6. `Shift`+click để thêm hoặc bớt món trong vùng chọn → **Align left**. Mở tab **History** để thấy thao tác đó là **một entry** có các bước con bên trong.
7. `⌘G` để group, rồi `⇧⌘G` để ungroup.

**Lời thoại gợi ý**
> "Hit testing uses a spatial hash, then a bounding-box check, then an exact even-odd point-in-polygon test. So clicking inside the empty corner of this L-shaped sofa selects the rug underneath — a bounding box would get this wrong."

---

## Cảnh 5: Vẽ tường, cửa đi, cửa sổ (≈ 1 phút 30 giây)

**Mục đích:** vẽ tường liên tiếp có snap, tự nối góc, tự nhận chữ T; cắt cửa vào tường.

**Thao tác**
1. Bấm `−` hai lần để zoom **50–75%**, rồi pan để có khoảng trống bên phải plan (x khoảng 13–18 m).
2. Bấm `W`. Thanh gợi ý báo **Walls layer is locked**, bấm **Unlock**.
3. Click 4 góc của một phòng khoảng 3 × 3 m, rồi **Enter** để khép kín. Trong lúc vẽ, chỉ ra nhãn chiều dài/góc và thẻ **Wall graph** trong panel phải (Nodes, Segments, Closed rooms).
4. Vẽ thêm một tường ngăn nối vào giữa một cạnh để có **chữ T**, rồi `Esc`.
5. Bấm `D`, rê lên một tường của phòng mới để thấy cánh cửa và cung mở; giữ `Shift` để đổi bản lề; click để đặt. Bấm `O` rồi click để đặt cửa sổ.
6. Bấm `V`, chọn một tường của phòng mới rồi kéo nó ra xa: **các tường nối vào đi theo, góc vẫn khít**.

**Lời thoại gợi ý**
> "Walls draw in a chain with angle, grid and endpoint snapping. Corners are mitred automatically, T-junctions are detected, and doors cut into walls with the swing shown. Move a wall and everything joined to it follows."

**Lưu ý:** phòng vẽ ở cảnh này sẽ dùng lại ở cảnh 9 (đặt tên phòng), nên đừng xoá.

---

## Cảnh 6: Thư viện nội thất và điện (≈ 1 phút 15 giây)

**Mục đích:** kéo-thả có luật đặt đồ; hệ thống điện có mạch (circuit).

**Thao tác**
1. Mở tab **Library**, bấm `⌘K`, gõ `sofa`.
2. Kéo một sofa vào phòng mới, **sát bức tường phía trên**. Sofa thả ra quay lưng lên trên, nên sẽ tự áp lưng vào tường đó; muốn áp vào tường bất kỳ thì bật **Auto-rotate to nearest wall** trong panel phải trước khi kéo. Trong lúc kéo, chỉ ra: bóng mờ, vùng thả màu xanh, gợi ý căn thẳng hàng, và trạng thái va chạm/lối đi 0.60 m ở panel phải.
3. Bấm chip **Electrical** (lăn chuột trên hàng chip nếu chip bị khuất) và kéo thẻ **Outlet** lên tường: ổ cắm tự bám vào mặt tường.
4. Bấm `E` (tool Electrical), bấm `2` (Switch), chọn chip **C2** trong panel. Rê lên tường để thấy dây nét đứt nối thử tới đèn của C2, rồi click để đặt.
5. Bấm `3` (Ceiling light), chọn **+ New** (tạo C5), click giữa phòng mới.
6. Bấm `V` và click một công tắc có sẵn: các đèn cùng mạch được khoanh vòng, kèm nhãn `C1 · 1 switch · 1 light`. Đổi sang **C3** trong mục **Circuit**.

**Lời thoại gợi ý**
> "The library applies placement rules — snap back to the wall, keep a walkway, show collisions. Electrical fixtures mount on wall faces, stay out of doorways, and wire into circuits you can rewire at any time."

---

## Cảnh 7: Layers (≈ 45 giây)

**Mục đích:** layer có luật ở tầng dữ liệu (khoá, ẩn, thứ tự vẽ), và mọi thay đổi layer đều undo được.

**Thao tác**
1. Tab **Layers**, click tên layer **Electrical** để mở **Layers manager**.
2. Kéo Electrical đổi thứ tự; bật/tắt 👁 (ẩn/hiện) và 🔒 (khoá); kéo thanh **Opacity**.
3. Bật **Cache as static bitmap** và giải thích layer tĩnh được vẽ một lần rồi dán lại.
4. Click ra canvas để thoát. Chọn một món đồ → Properties → **Layer** → chuyển sang layer khác.
5. `⌘Z` để thấy thao tác layer cũng undo được.

**Lời thoại gợi ý**
> "Layers are enforced by the model: a locked layer refuses edits, a hidden one can't be clicked. Reordering changes both paint order and click priority — and it's all undoable."

---

## Cảnh 8: History (≈ 45 giây)

**Mục đích:** một undo stack chung cho mọi thao tác.

**Thao tác**
1. Tab **History**: chỉ ra danh sách thao tác, con trỏ **HEAD**, số thứ tự và giờ.
2. `⌘Z` vài lần: các entry redo chuyển xám, có toast báo.
3. Click một entry để xem **payload** ở panel phải. **Double-click** một entry để nhảy tới đúng thời điểm đó.
4. Chỉ ra các tuỳ chọn: *Merge drags within 300 ms*, *Persist history*, *Branch on edit after undo*.

**Lời thoại gợi ý**
> "One global command stack — up to 200 steps — for walls, furniture, layers, annotations, everything. You can inspect any command's payload and jump straight to any point in history."

---

## Cảnh 9: Chú thích, đo đạc và khung tên (≈ 2 phút)

**Mục đích:** bộ công cụ trình bày bản vẽ.

**Thao tác**
1. **Measure (`M`):** click 2 điểm trên mặt tường để thấy snap và số đo; **Enter** để giữ lại thành dimension.
2. **Dimension (`L`):** click, click, kéo ra, click. Click tiếp 1–2 điểm để nối thành **chuỗi**, rồi **Enter**.
3. **Tên phòng (`T` → chọn **Room name** trong panel):**
   - rê vào **phòng mới vẽ ở cảnh 5**: viền phòng và diện tích tự hiện;
   - click, gõ `Storage`, Enter;
   - rê vào phòng **Bath** có sẵn: hiện "click to rename".
4. **Callout (`N` → chọn **Callout**):** click một điểm, gõ `Pendant`, `Shift+Enter`, `Brass, 0.90 m above table`, Enter.
5. **Revision cloud (`R`):** kéo một khung quanh vùng thay đổi, gõ `Move door 0.30 m`, Enter. Tam giác Δ3 tự đánh số.
6. **Sửa chú thích (`V`):** kéo khung note sang chỗ khác (ghim đứng yên), **double-click** để sửa chữ, chọn callout rồi **Delete**, sau đó `⌘Z`.
7. Tab **Document** (panel phải):
   - sửa ô **Drawn**, bấm **Set Rev 3** → khung tên trên canvas cập nhật;
   - kéo xuống **Area schedule** để thấy phòng *Storage* vừa thêm.
8. Trong Document, đổi **Units** sang **Imperial**: mọi số đo đổi sang ft-in. Đổi lại **Metric**.

**Lời thoại gợi ý**
> "Dimensions, live measurements, callouts, notes, revision clouds. Room areas are computed from the walls themselves — name a room and it lands in the area schedule. Everything is editable in place, and the title block is part of the document."

---

## Cảnh 10: Export và in (≈ 1 phút)

**Mục đích:** xuất bản vẽ vector chuẩn in ấn.

**Thao tác**
1. Bấm **Export** trên topbar.
2. Chọn **PDF**, **A3**, **Landscape**, tỉ lệ **1:50**. Chỉ ra danh sách layer (Electrical mặc định không in) và các thành phần khung tên, la bàn, thanh tỉ lệ; preview cập nhật ngay.
3. Export PDF, mở file vừa tải và zoom sâu để thấy nét vẫn sắc (vector).
4. Nhắc thêm: PNG 300 dpi, SVG, file dự án JSON (kèm lịch sử undo), **Print directly**.

**Lời thoại gợi ý**
> "Export to vector PDF or SVG at a true 1:50 scale, PNG at 300 dpi, or the full project as JSON — history included."

---

## Cảnh 11: Hiệu năng (≈ 1 phút)

**Mục đích:** chứng minh vẫn mượt với 842 object.

**Thao tác**
1. Logo **Planwise** → **Open stress plan · Northgate** (trang tải lại, HUD tự bật).
2. Pan và zoom liên tục: FPS khoảng 60, thời gian khung hình nằm dưới vạch 16.7 ms.
3. Chỉ ra bảng chia thời gian khung hình (input, hit-test, draw static/dynamic, composite) và đồ thị lịch sử khung hình.
4. Trong tab **Performance**, tắt **Viewport culling** để thấy số draw call tăng, rồi bật lại. Bật **Show dirty regions**, kéo một bàn làm việc để thấy chỉ vùng bẩn được vẽ lại.
5. Quay về: Logo → **Open demo** → **Open demo**.

**Lời thoại gợi ý**
> "Here's a large office plan with 842 objects. Static layers are cached, only dirty regions are redrawn, and anything off-screen is culled — so we hold 60 frames per second with room to spare."

**Lưu ý:** dùng **nút con bọ** trên thanh công cụ trái để bật/tắt HUD, thay vì phím `F12` (trên một số máy F12 mở DevTools). Plan Northgate không tự lưu.

---

## Cảnh 12: Tạo plan mới và kết (≈ 45 giây)

**Mục đích:** bắt đầu dự án riêng.

**Thao tác**
1. Logo → **New plan…** → chọn một template (ví dụ *Studio apartment*), đặt tên, chọn đơn vị → **Create plan →**.
2. Click tên plan trên breadcrumb để đổi tên, Enter.
3. Chỉ trạng thái **Saved** trên topbar: dự án tự lưu vào trình duyệt.

**Lời thoại gợi ý**
> "Start from a template, name it, and you're drawing. Every change autosaves — and every change can be undone. That's Planwise."

**Lưu ý:** tạo plan mới sẽ thay thế plan demo trong bộ nhớ trình duyệt. Muốn quay lại demo thì dùng Logo → **Open demo**.

---

## Bản ngắn khoảng 3 phút

1. Cảnh 1, mở đầu (20 giây).
2. Cảnh 4, **click vào góc trống của sofa chữ L** (40 giây).
3. Cảnh 5, vẽ phòng 4 tường, đặt cửa, kéo tường cho các tường khác đi theo (45 giây).
4. Cảnh 9, **đặt tên phòng**: diện tích tự tính từ tường (20 giây).
5. Cảnh 11, Northgate 842 object ở 60 fps (30 giây).
6. Cảnh 10, Export PDF 1:50 (15 giây).
7. Câu kết (10 giây).

## Xử lý khi có sự cố trong lúc quay

| Tình huống | Cách xử lý |
|---|---|
| Không vẽ được tường, cửa hay cửa sổ | Layer **Walls** của demo đang khoá: bấm **Unlock** trên thanh gợi ý. |
| Click nhầm hoặc kéo nhầm | `⌘Z`, hoặc `Esc` nếu đang kéo dở. |
| Không còn chỗ trống để vẽ | Bấm `−` để zoom ra, giữ `Space` + kéo để pan. |
| Chip **Electrical** bị khuất | Lăn chuột trên hàng chip, hoặc bấm nút `›`. |
| Muốn làm lại từ đầu | Logo → **Open demo** → **Open demo**. |
