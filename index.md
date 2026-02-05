---
layout: default
title: Tematika
---

{% include hero-illustration.html %}

# Tematika

## Kurzus információk

**Oktató:** Dr. Vaitkus Márton
**Email:** vaitkus@iit.bme.hu

### Tantárgy leírása

Napjainkban a generatív mesterséges intelligencia (artificial intelligence, AI) forradalmasítani készül a számítógépes grafika és animáció, valamint a digitális tartalomgyártás területét. A korszerű generatív technikákkal valósághű álló- vagy mozgóképek szintetizálása lehetséges akár szöveges leírás alapján. Hasonló módszerekkel a modellező programokban vagy grafikus motorokban közvetlenül felhasználható 3D modellek vagy komplett virtuális környezetek generálása is lehetségessé vált. A generatív módszerek ilyen rohamos fejlődését két fontos alaptechnológia tette lehetővé. Az egyik a mélytanulás, azaz a többrétegű neurális hálózatok alkalmazása a diffúziós és más generatív modellekben. A másik az inverz grafika, ami – megfordítva a grafikai képalkotás szokásos folyamatát – a kívánt képi látványból kiindulva szintetizálja a megjelenített 3D színtért elemeit. Mindkét technológia sikerében kulcsszerepet játszik a differenciális optimalizáció és annak megvalósítása párhuzamos (általában grafikus) hardveren. Az olyan kurrens módszerek, mint a "Neural Radiance Field" (NeRF), vagy a "3D Gaussian Splatting" (3DGS) tudományos alapkutatásból igen rövid időn belül gyakorlati technológiává léptek elő és fontos elemei a 3D generatív modellezésnek.

A tárgy célja bevezetni a hallgatót a 2D és 3D generatív AI, valamint az inverz grafika világába. A neurális hálózatokhoz, mélytanuláshoz, optimalizációhoz és 3D geometriához kapcsolódó alapismeretek elsajátítása után a hallgató kompetenciákat szerezhet a diffúziós módszerekkel történő képszintézis, a generatív módszerek 3D grafikai alkalmazásai és a differenciálható renderelés területén. Az elméleti alapokon felül az ismertetett technikák gyakorlati implementációi és alkalmazásai is bemutatásra kerülnek.

---

## Alapozás

### Bevezetés
A generatív mesterséges intelligencia fejlődéstörténete és jelenlegi helyzete. A digitális tartalomelőállítás kihívásai és a generatív módszerek lehetséges alkalmazásai. Etikai és jogi szempontok. Az inverz grafika és a differenciálhatóság jelentősége. Válogatott alkalmazások bemutatása.

### Optimalizáció és automatikus differenciálás
A szükséges előismeretek felelevenítése. Optimalizációs feladat fogalma, fajtái. Gradiens módszer, stochasztikus gradiens, momentum, ADAM. Newton és kvázi-Newton módszerek. Forward és reverse módú automatikus differenciálás módszerei és szoftveres implementációi.

### Mélytanulás alapjai
Neurális hálózatok története, aktivációs függvény, lineáris és nemlineáris hálózatok. Multi-Layer Perceptron (MLP). Tanítás, backpropagation algoritmus, nagy adathalmazok kezelése. Konvolúciós neurális hálók. Népszerű architektúrák. Reziduális hálók. Regularizációs módszerek. U-Net architektúra.

### Automatikus differenciálás és mélytanulás a gyakorlatban
Bevezetés a PyTorch használatába. Jupyter notebookok, Google Colab használata. Adatok beolvasása és megjelenítése, optimalizációs problémák megoldása, neurális hálózatok tanítása.

---

## Generatív Képszintézis

### Matematikai alapok
Valószínűségszámítási és lineáris algebrai előismeretek átismétlése. Valószínűségi változók mintavételezése. Többdimenziós normális eloszlások. Log-likelihood, Gibbs eloszlás, score függvény. Vektormezők, folyamok, közönséges és sztochasztikus differenciálegyenletek. Gradiens és Langevin dinamika.

### Generatív módszerek alapjai
Diszkriminatív és generatív tanulás. Explicit és implicit generatív módszerek. Generált eloszlások minősítése: IS, FID. Látens tér fogalma. PCA. Autoenkóderek, VAE. GAN. Feltételes generálás.

### Autoregresszív modellek
RNN. Transformer architektúra, figyelemmechanizmus. Vision Transformer. Képgenerálás pixel/látens térben. Kép tokenizálása, VQVAE/GAN.

### Diffúziós modellek
A zajcsökkentő autoenkóderektől a diffúziós modellekig. DDPM, DDIM, EDM. Score matching. Zaj ütemezési és mintavételezési technikák. Megvalósítás U-Net és Transformer architektúrákkal. Látens diffúzió.

### Folyamillesztés
Valószínűségi folyamok, folyamillesztés (flow matching). Kapcsolat a diffúzióval és egyéb módszerekkel. Integrálási módszerek. Rektifikáció. Sztochasztikus interpolánsok, folyamok általános eloszlások között, összerendelési módszerek.

### Vezérelt generálás
Multimodalitás, CLIP beágyazás. Vezérelt diffúziós és folyam-alapú módszerek, classifier-free-guidance. ControlNet. Finomhangolási módszerek: DreamBooth, LoRA. Szöveges inverzió.

### Diffúziós képszintézis a gyakorlatban
Esettanulmányok: a Stable Diffusion architektúra fejlődése, kurrens modellek áttekintése. HuggingFace Diffusers könyvtár bemutatása. *1. házi feladat kiadása.*

### Haladó diffúziós képszintézis
Gyorsított mintavételezés, disztilláció. Finomhangolás modern módszerei. Feliratok generálása. Diffúziós dekódolás. Diffúziós priorok a képfeldolgozásban. Novel View Synthesis.

### Videógenerálás
A videógenerálás kihívásai. Autóregressziv és diffúziós megközelítések. Időbeli konzisztencia biztosítása. Diffusion forcing. Vezérlés képpel, hanggal. Hang generálása. Akció-vezérelt generálás, "világmodell". Kitekintés.

---

## Generatív 3D és Inverz Grafika

### 3D generatív modellezés alapjai
3D geometriai reprezentációk fajtái: pontfelhők, sokszöghálók, parametrikus/implicit felületek, volumetrikus adatok. Reprezentációk közötti konverzió, masírozó kockák és variánsai. Neurális hálók alkalmazása 3D adatokra. Pytorch3D. Pontfelhők, voxelek, hálók generálása, topológiai kihívások.

### Neurális implicit reprezentációk
Implicit felületek, távolságmezők, indikátorfüggvények reprezentációja neurális hálókkal. Pozicionális kódolás. Aktivációs függvények megválasztása. Regularizációs módszerek. Hibrid implicit reprezentációk. Neurális implicit kondicionálás és generálás módszerei.

### Inverz grafika alapjai
Motiváció. A grafikai képszintézis módszerei. Raszterizáció, sugárkövetés és sphere tracing differenciálhatóvá tétele. Radiant backpropagation. Sziluettek problémája. Nem-differenciálható renderer differenciálhatóvá alakítása.

### Inverz grafika alkalmazásai
Explicit és implicit geometria optimalizációja, gradiens mezők szűrése. Differenciálás tesszelláción keresztül. Textúrák, anyagjellemzők, 3D orientációk optimalizációja. NVIDIA Kaolin és Mitsuba szoftverek bemutatása. *2. házi feladat kiadása.*

### Neurális Radiancia Mezők (NeRF)
Volumetrikus renderelés alapjai, ray marching. Radiancia mezők reprezentációja gömbi harmonikusokkal és neurális hálókkal. Differenciálható renderelés és optimalizáció. Radiancia mezők konverziója poligonhálóvá. NeRF variánsai.

### 3D Gaussian Splatting (3DGS)
Előzmények: pont-alapú grafika. Gaussi pontfelhőkkel reprezentált radiancia mezők differenciálható renderelése. Tiled rendering, 3DGS optimalizáció. 3DGS variánsai.

### NeRF / 3DGS a gyakorlatban
Fotogrammetria alapjai. Bemeneti adatok előkészítése, kamerapozíciók meghatározása. Szoftverek bemutatása: COLMAP, Instant NGP, Nerfstudio, SuperSplat. Dinamikus NeRF / 3DGS. Többkamerás felvételek készítése.

### Inverz grafika generatív alkalmazásai
2D generatív modellek 3D disztillációja: SDS, DreamFusion és továbbfejlesztései. NeRF / 3DGS generálás módszerei. 3D avatárok generálása és vezérlése. Nagy rekonstrukciós modellek.

---

## Kitekintés, lezárás

Hallgatói önálló projektek előadásai.

