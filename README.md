# Lounasvahti

Suomenkielinen selainpalvelu, joka kokoaa paikallisten ravintoloiden päivän
lounaslistat yhteen näkymään. Ensimmäinen tuettu lähde on Sodexon Ravintola
Optimes Business Garden Jyväskylässä.

## Toiminnot

- päivän ruokalista haetaan aina sivua avattaessa ja päivitettäessä
- Sodexon oma JSON-ruokalista tunnistetaan ravintolasivulta automaattisesti
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

## Jatkokehitys

Yleinen HTML-tunnistin toimii parhaalla yrityksellä. Uusille suurille
ravintolaketjuille kannattaa lisätä lähdekohtainen jäsennin Sodexo-jäsentimen
rinnalle, jotta annokset, ruokavaliot, hinnat ja aukioloajat ovat aina tarkkoja.
