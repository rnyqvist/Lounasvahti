# Lounasvahti

Suomenkielinen selainpalvelu, joka kokoaa paikallisten ravintoloiden päivän
lounaslistat yhteen näkymään. Oletuslistalla ovat Optimes Business Garden,
Restaurant Anna, Huili Tourula, Scandic Jyväskylä Station ja Tourulan Ravintola.

## Toiminnot

- Päivän bittipala: ohjelmointihuumoria ja käytännön vinkki tiimin lounastauolle.
  60 toimitettua sisältöä vaihtuu Suomen vuorokauden mukaan; kierros toistuu 60 päivän
  välein. Sama päivän sisältö kaikille, ilman ulkoisia rajapintoja tai käyttömaksuja.

- päivän ruokalista haetaan aina sivua avattaessa ja päivitettäessä
- Sodexon JSON-, Juvenes Jamix-, Huili-, Lounaat.info- ja Tourulan Ravintolan
  Google Sheets -ruokalistat tunnistetaan
  lähdekohtaisilla jäsentimillä
- muille lounassivuille on yleinen HTML-pohjainen ruokalistan tunnistus
- käyttäjä voi lisätä ja poistaa ravintoloita URL-osoitteen perusteella
- ravintolalista säilyy selaimen paikallisessa muistissa
- palvelinpuolinen haku kiertää selainten CORS-rajoitteet ja estää paikallisten
  verkko-osoitteiden hakemisen

## Kehitys

```powershell
npm.cmd install
npm.cmd run dev
```

Tuotantoversion tarkistus:

```powershell
npm.cmd run build
```

Regression tests and TypeScript validation:

```powershell
npm.cmd test
npm.cmd run typecheck
```

Menus now use exact Helsinki dates. Unverified extraction is labelled explicitly,
and old weekday menus are not substituted for today's menu. Source dietary text
is preserved; missing component labels do not imply that the whole meal shares a
diet. The page shows individual fetch times and refreshes when the Helsinki day changes.

## Jatkokehitys

Yleinen HTML-tunnistin toimii parhaalla yrityksellä. Uusille suurille
ravintolaketjuille kannattaa lisätä lähdekohtainen jäsennin Sodexo-jäsentimen
rinnalle, jotta annokset, ruokavaliot, hinnat ja aukioloajat ovat aina tarkkoja.
