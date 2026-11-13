# Corrigir natação (.FIT)

App web para corrigir **tempo** e **distância** das séries de um treino de natação gravado em arquivo `.FIT`
(Garmin e outros relógios) e exportar o arquivo corrigido para reenviar ao Garmin Connect, Strava etc.

Tudo roda no navegador: o arquivo **não é enviado** para nenhum servidor.

## Como usar

1. No Garmin Connect, abra a atividade → ⚙️ → **Exportar original** (baixa um `.zip`).
2. Abra a app e arraste o `.zip` ou o `.fit` extraído.
3. Corrija a distância (ou nº de piscinas) e/ou o tempo de cada série.
   - Opção **“compensar no descanso seguinte”** (ligada por padrão): se a série ficou mais longa porque você
     apertou o botão atrasado, o descanso seguinte absorve a diferença e o restante do treino fica igual.
4. Clique em **Baixar FIT corrigido**.
5. Apague a atividade original no Garmin Connect/Strava e importe o arquivo corrigido.

## O que é recalculado

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

## Rodando localmente

Não há build: são arquivos estáticos (HTML + ES modules).

```bash
npm start          # serve em http://localhost:8080
npm install && npm test
```

Os testes usam o [FIT SDK oficial da Garmin](https://www.npmjs.com/package/@garmin/fitsdk) para gerar arquivos de
exemplo e validar (CRC e decodificação) os arquivos produzidos.

## Publicar no GitHub Pages

Settings → Pages → *Deploy from a branch* → branch `main`, pasta `/ (root)`.

## Estrutura

- `src/fit.js` — leitor/escritor FIT de baixo nível (preserva mensagens cruas, recalcula CRC)
- `src/swim.js` — análise das séries e aplicação das correções
- `src/zip.js` — extração do `.fit` de dentro do `.zip` do Garmin Connect
- `src/app.js`, `index.html`, `styles.css` — interface
