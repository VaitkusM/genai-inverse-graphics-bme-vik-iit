---
layout: default
title: 2. Házi feladat
permalink: /hazi2/
---

## 2. Házi feladat: Differenciálható volumetrikus renderelés

---

### Leírás

Ebben a házi feladatban egy egyszerű **NeRF-szerű** rendszert fogsz építeni
PyTorch-ban, amely **többnézetes képekből** rekonstruál egy 3D térben élő
sugárzási mezőt (radiance field). A munka a `torch` és `numpy` alapokat
használja; az opcionális utolsó részben a saját megoldásunkat összehasonlítjuk
a `pytorch3d` beépített volumetrikus renderelőjével.

**A feladat részei:**

1. **Volumetrikus renderelés egyetlen sugárra** — a vol-rendering integrál diszkretizálása, transzparencia, alpha-kompozíció.
2. **Procedurális hangulatjel illesztése voxel-ráccsal** — explicit 3D rács illesztése előállított képekre, differenciálható renderelés gyakorlatban.
3. **Tiny-NeRF** — a voxel-rácsot egy kis MLP + pozicionális kódolás váltja fel; novel-view szintézis.
4. **(Opcionális) Összehasonlítás PyTorch3D-vel** — ugyanaz a jelenet a PyTorch3D `ImplicitRenderer`-ével.

---

### Notebook

A feladat egy Jupyter Notebook formájában van kiadva, amely tartalmazza az elméleti hátteret, a kiinduló kódot és a megoldandó feladatokat.

**Letöltés:** [HF2.ipynb](/eloadasok/HF2.ipynb)

A notebook futtatható:
- **Google Colab-ban** (ajánlott, GPU-val a 3. rész is pár perc alatt befut)
- **Lokálisan** Conda vagy uv környezetben (CPU-n a 3. rész lassabb)

---

### Követelmények

- A notebook `# TODO` kommentekkel jelölt részeinek implementálása (összesen 6 db, mind néhány soros)
- A renderelt és az analitikus képek konvergenciája Part 2 és Part 3 végére
- Generált képek vizualizálása és értékelése
- A 4. (PyTorch3D) rész opcionális

---

### Határidő

2026.05.27.

---

### Beadás

- Kitöltött, **lefuttatott** notebook (`.ipynb`) feltöltése (Moodle).
