# J.S. Bach: Goldberg Variations, BWV 988 — Interactive Zero-Jargon Architecture Lab
**巴赫《哥德堡变奏曲》BWV 988 · 零基础双语互动建筑馆（Yunchan Lim · 2025 卡内基音乐厅现场）**

An interactive, zero-sheet-music-prerequisite bilingual (`中文 / English`) listening and visual architecture laboratory built around **Yunchan Lim's April 25, 2025 Live at Carnegie Hall** recording (Decca Classics, 32 tracks).

## Architectural Innovations for Complete Beginners ("不识谱也能从 0 听懂")
1. **🎓 60-Second Zero-Jargon Interactive Sandbox (`#primerSection`)**:
   - **Step 1 · Ground-Bass Floorplan ("换房不换地基")**: Hear Bach's 8 opening Ground Bass pillars (`G–F#–E–D–B–C–D–G`) alone via Web Audio, then layer the *Aria*, *Var. 1 (Polonaise)*, and *Var. 30 (Quodlibet)* over the exact same glowing foundation.
   - **Step 2 · Shadow Canon vs. Water-Mirror Canon**: Live dual-ribbon visualizer contrasting *Var. 3* (Unison shadow chase) with *Var. 15* (Inverted mirror canon at the 5th across a horizontal symmetry axis).
   - **Step 3 · Two-Manual Acrobatics on One Grand Piano (`a 2 Clav.`)**: Hear and see how two harpsichord keyboards collide and cross over each other on Yunchan Lim's single Carnegie Hall Steinway (*Var. 5*).
2. **🏛️ 32-Pillar Ground-Bass Real-Time Compass & Same-Pillar Teleport**:
   - Tracks all **32 Harmonic Pillars (`Part A: 1–16` | `Part B: 17–32`)** and repeat passes (`A1 / A2 / B1 / B2` on `Aria` & `Var. 1–30`; repeat-less `A1 / B1` on `Aria da capo`) in real time.
   - **🔗 Same-Pillar Lock Teleport**: Switch between any of the 32 tracks while staying locked to the *exact same harmonic pillar* (`Pillar #1..32`) to compare Bach's transformations side by side.
3. **🎹 60-fps Multi-Voice Contrapuntal Ribbon & 88-Key Crossing X-Ray**:
   - Every measure of all 32 tracks is aligned via **20 Hz CQT Chroma DTW** (`mean cosine similarity = 0.819`) to voice-separated Bach Urtext MIDI threads, lighting up both the scrolling voice ribbons and a full **88-key Steinway register map** in real time, plus standalone **Voice Solo/Mute Synth Dissection** and **Ghost Ground-Bass Bell Overlay**.
4. **🗺️ 10-Triad Symmetrical Cathedral Matrix**:
   - Maps `Aria` -> **10 Rows × 3 Columns** (`1. Genre/Dance` · `2. Two-Manual Virtuosity` · `3. Ascending Canons 1°→9° + Quodlibet`) split at the *Var. 16 French Overture* -> `Aria da capo`.

## Local Development & Reproducible Build
```bash
# Start local HTTP-206 byte-range server
python3 serve.py 8080

# Rebuild alignment, compile data.js, and run 5-Gate QA suite
unzip -o rebuild-tools.zip
uv run --with mido --with librosa --with scipy --with numpy python3 tools/score_pipeline.py
python3 tools/build_atlas.py
uv run --with librosa --with numpy python3 tools/verify_atlas.py
```
