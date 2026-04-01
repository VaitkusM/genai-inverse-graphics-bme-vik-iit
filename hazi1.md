---
layout: default
title: 1. Házi feladat
permalink: /hazi1/
---

## 1. Házi feladat: Flow Matching alapú generatív modell

---

### Leírás

Ebben a házi feladatban egy **flow matching** alapú generatív modellt fogsz implementálni PyTorch-ban. A feladat során megismerkedsz a modern generatív modellek működésével, és gyakorlati tapasztalatot szerzel neurális hálózatok tanításában.

**A feladat részei:**

1. **2D toy example** - Egyszerű 2D adathalmazon (two moons) tanított DDPM/DDIM (opcionális) és flow matching modellek
2. **Unconditional MNIST generálás** - Kézzel írt számjegyek generálása U-Net architektúrával
3. **Conditional generálás** - Megadott osztályú (0-9) számjegyek generálása
4. **Classifier-Free Guidance** - A generálás minőségének javítása guidance technikával

---

### Notebook

A feladat egy Jupyter Notebook formájában van kiadva, amely tartalmazza az elméleti hátteret, a kiinduló kódot és a megoldandó feladatokat.

**Letöltés:** [HF1.ipynb](/eloadasok/HF1.ipynb)

A notebook futtatható:
- **Google Colab-ban** (ajánlott, GPU elérhető)
- **Lokálisan** Conda vagy uv környezetben

---

### Követelmények

- A notebook `# TODO` kommentekkel jelölt részeinek implementálása
- A tanítási és mintavételezési függvények helyes működése
- Generált minták vizualizálása és értékelése

---

### Határidő

2026.04.20.

---

### Beadás

- Kitöltött notebook (`.ipynb`) feltöltése (Moodle).
