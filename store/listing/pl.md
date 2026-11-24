# Store listing: Polish

Copy each block into the matching field of the Store listing tab after switching the listing
language to Polish.

## Name

Taken from the package (`_locales/pl/messages.json`).

```
Mysttic Adblock Enjoyer
```

## Summary

Taken from the package. At most 132 characters.

```
Rozbraja ścianę anti-adblock Ad-Shield („Please allow ads on this site”), zanim wyczyści stronę albo Cię przekieruje.
```

## Description

```
Część stron używa Ad-Shield do wykrywania adblocków. Gdy jego kontrola zadziała, strona robi się pusta, pojawia się komunikat „Please allow ads on this site. Click OK to learn more.”, a potem następuje przeładowanie albo przekierowanie na error-report.com. Zdarza się to nawet wtedy, gdy adblock niczego nie zepsuł: wystarczy jeden filtr przeciw wyskakującym oknom.

Mysttic Adblock Enjoyer zatrzymuje tę ścianę, zanim się pojawi.

JAK TO DZIAŁA
• Rozpoznaje dwa tagi Ad-Shield, loader i jego watchdoga, po sygnaturze kodu, jeszcze w trakcie ładowania strony.
• Wyłącza oba, zanim przeglądarka je uruchomi. Bez pustej strony, komunikatu i przekierowania.
• Stron bez Ad-Shield nie dotyka.

CZYM NIE JEST
• To nie jest adblock. Nie blokuje reklam ani żądań sieciowych. Używaj dalej swojego adblocka.
• Nie obchodzi paywalli ani logowania.

ZAKRES
Obsługuje strony z aktualnym loaderem Ad-Shield (SDK 1.2.x). Starsze integracje Ad-Shield celowo zostawia w spokoju, więc tam ściana może się nadal pojawiać.

PRYWATNOŚĆ
• Niczego nie zbiera i niczego nie wysyła. Bez konta, reklam i analityki.
• Bez procesu w tle i bez zdalnego kodu. Cała wtyczka to jeden mały skrypt.

DLACZEGO POTRZEBUJE DOSTĘPU DO WSZYSTKICH STRON
Ad-Shield działa na wielu niepowiązanych stronach i trzeba go zatrzymać, zanim uruchomią się skrypty strony, dlatego skrypt jest wstrzykiwany na każdej stronie na samym początku ładowania. Sprawdza wyłącznie tagi script, a na stronie bez Ad-Shield kończy pracę zaraz po jej wczytaniu.
```

## Graphics

| Field | File |
| --- | --- |
| Screenshot 1 | `store/assets/screenshot-1-pl.png` |
| Screenshot 2 | `store/assets/screenshot-2-pl.png` |
