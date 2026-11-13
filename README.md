# Corrigir natação (.FIT) · Swim FIT fixer

**👉 App: https://dliedke.github.io/swim-fit-file-fix/**

[Português](#português) · [English](#english)

---

## Português

App web para corrigir **tempo** e **distância** das séries de um treino de natação gravado em arquivo `.FIT`
(Garmin e outros relógios) e exportar o arquivo corrigido para reenviar ao Garmin Connect, Strava etc.

Tudo roda no navegador: o arquivo **não é enviado** para nenhum servidor. A interface aparece em português ou
inglês conforme o idioma do navegador (dá para trocar no canto superior direito).

### Como usar

1. No Garmin Connect, abra a atividade → ⚙️ → **Exportar original** (baixa um `.zip`).
2. Abra a [app](https://dliedke.github.io/swim-fit-file-fix/) e arraste o `.zip` ou o `.fit` extraído.
3. Corrija a distância (ou nº de piscinas) e/ou o tempo de cada série.
   - Opção **“compensar no descanso seguinte”** (ligada por padrão): se a série ficou mais longa porque você
     apertou o botão atrasado, o descanso seguinte absorve a diferença e o restante do treino fica igual.
4. Clique em **Baixar FIT corrigido**.
5. Apague a atividade original e envie o arquivo corrigido:
   - **Garmin Connect:** https://connect.garmin.com/app/import-data
   - **Strava:** https://www.strava.com/upload/select

   Se a original não for apagada, o upload é recusado por ser duplicado.

### O que é recalculado

| Onde      | Campos |
|-----------|--------|
| Piscinas (`length`) | quantidade, duração, início, velocidade, cadência; índices renumerados |
| Séries (`lap`) | tempo, distância, nº de piscinas, velocidade média/máx., cadência, SWOLF e braçadas/piscina (campos Garmin) |
| Treino (`session`/`activity`) | distância e tempo totais, tempo ativo, nº de piscinas, velocidade média/máx., cadência, SWOLF, braçadas/piscina |
| Registros (`record`) | horários remapeados; distância acumulada ajustada |

Ao mudar a distância de uma série na piscina:

- se uma piscina gravada é claramente **longa demais** (≥ 1,5× as outras — o relógio perdeu uma virada), ela é dividida ao meio;
- se é claramente **curta demais** (≤ 0,66× — virada a mais), é unida à vizinha;
- senão, o tempo e as braçadas da série são **distribuídos igualmente** entre as piscinas (como o Garmin Connect faz).

Todo o resto do arquivo (frequência cardíaca, calorias, mensagens proprietárias, campos de desenvolvedor) é
preservado byte a byte — sem edições, o arquivo exportado é idêntico ao original.

---

## English

Web app to fix the **time** and **distance** of the sets in a swim workout recorded as a `.FIT` file
(Garmin and other watches) and export the corrected file to re-upload to Garmin Connect, Strava, etc.

Everything runs in your browser: the file is **never uploaded** to any server. The interface is shown in English
or Portuguese according to your browser language (you can switch it in the top-right corner).

### How to use

1. In Garmin Connect, open the activity → ⚙️ → **Export Original** (downloads a `.zip`).
2. Open the [app](https://dliedke.github.io/swim-fit-file-fix/) and drop the `.zip` or the extracted `.fit`.
3. Fix the distance (or number of lengths) and/or the time of each set.
   - **“Offset it in the following rest”** option (on by default): if a set got longer because you pressed the
     lap button late, the following rest absorbs the difference and the rest of the workout keeps its timing.
4. Click **Download fixed FIT**.
5. Delete the original activity and upload the fixed file:
   - **Garmin Connect:** https://connect.garmin.com/app/import-data
   - **Strava:** https://www.strava.com/upload/select

   If the original is not deleted, the upload is rejected as a duplicate.

### What gets recalculated

| Where     | Fields |
|-----------|--------|
| Lengths (`length`) | count, duration, start, speed, cadence; indexes renumbered |
| Sets (`lap`) | time, distance, number of lengths, avg/max speed, cadence, SWOLF and strokes per length (Garmin fields) |
| Workout (`session`/`activity`) | total distance and time, active time, number of lengths, avg/max speed, cadence, SWOLF, strokes per length |
| Records (`record`) | timestamps remapped; cumulative distance adjusted |

When changing the distance of a pool set:

- if a recorded length is clearly **too long** (≥ 1.5× the others — the watch missed a turn), it is split in half;
- if it is clearly **too short** (≤ 0.66× — an extra turn), it is merged with its neighbour;
- otherwise, the set’s time and strokes are **spread evenly** across its lengths (as Garmin Connect does).

Everything else in the file (heart rate, calories, proprietary messages, developer fields) is preserved byte for
byte — with no edits, the exported file is identical to the original.

---

## Desenvolvimento · Development

Sem build: arquivos estáticos (HTML + CSS + JavaScript ES modules). · No build step: static files.

```bash
npm start                  # http://localhost:8080
npm install && npm test    # testes com o FIT SDK oficial da Garmin · tests use the official Garmin FIT SDK
```

Publicação · Deployment: GitHub Pages (Settings → Pages → *Deploy from a branch* → `main` / `(root)`).

| Arquivo · File | |
|---|---|
| `src/fit.js` | leitor/escritor FIT de baixo nível · low-level FIT reader/writer (raw messages, CRC) |
| `src/swim.js` | análise das séries e correções · set analysis and corrections |
| `src/zip.js` | extrai o `.fit` do `.zip` do Garmin Connect · extracts the `.fit` from Garmin’s `.zip` |
| `src/i18n.js` | textos PT/EN · PT/EN strings |
| `src/app.js`, `index.html`, `styles.css` | interface · UI |
