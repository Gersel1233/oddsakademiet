# Lært af Spiis — fejl I kan springe over

Spiis.dk har kørt med rigtige, betalende kunder i flere måneder. Alt herunder er
noget der **faktisk gik galt i produktion** — ikke teori. Hver post er skrevet som:
hvad kunden eller køkkenet oplevede, hvad årsagen viste sig at være, og hvilken
regel der kom ud af det.

Læs det ikke som en tjekliste til sidst. Det meste af det her kan kun bygges rigtigt
fra starten.

---

## DEL 1 — DE FEM DYRESTE FEJL

### 1. Databasen skal afvise alt det, hjemmesiden afviser

**Hvad skete der:** Køkkenet lukkede en weekend. Alligevel mødte der folk op med en
bestilling på to nachos om lørdagen.

**Årsagen:** Databasen tjekkede syv forskellige lukkeformer — nødbremse, blokerede
datoer, ferie, "kun take-away i dag", tidspunkt, udsolgt, antal. Men den tjekkede
**ikke åbningstiderne**. Dem kendte kun hjemmesiden. En kunde med siden åben fra i
går, eller en telefon med en gemt udgave, gik lige igennem på en lukket dag.

**Reglen:** En kundes browser er *aldrig* til at stole på. Den kan være timer eller
dage gammel. Skriv alle spærringer ned i to kolonner — hvad spærrer hjemmesiden, og
hvad spærrer databasen — og sørg for at anden kolonne er komplet. Hjemmesiden er
høflighed. Databasen er den eneste dør, der virkelig er låst.

**Sådan tester I det uden at ødelægge noget:** find en kombination, der bliver
afvist uanset hvad, så intet kan blive gemt. Fx en lukket dag *plus* et tidspunkt
uden for bestillingsvinduet. Er svaret "lukket", virker spærringen. Er det "tid",
gik den forbi jeres lukning og blev først fanget af noget andet.

---

### 2. Én tvetydig etiket kostede en hel aftens salg

**Hvad skete der:** Dagens ret var udsolgt ved 30 af 30. Køkkenet fandt ti portioner
mere, skrev **10** i antal-feltet — og retten blev ved med at stå udsolgt. De prøvede
igen. Samme resultat.

**Årsagen:** Feltet betød *"hvor mange vi laver i alt i dag"*. Midt i en vagt læser
man det som *"hvor mange der er tilbage"*. Regnestykket var korrekt — 10 minus 30
solgte er nul — men feltet betød noget andet, end det så ud til.

**Reglen:** Ethvert tal i en admin skal kunne læses rigtigt af en stresset person
klokken 18:30 med folk ved lugen. Hvis et felt kan læses på to måder, **skriv hvad
der faktisk er sket** ("Udsolgt — der er solgt 30 af 30") og giv en knap, der gør
det, de mener: `+10 portioner`, `+5`. Knapperne lægger til det allerede solgte i
stedet for at erstatte det, så ingen skal regne 30 + 10 i hovedet.

Det her er den vigtigste post på listen. Det var ikke en fejl i koden. Koden gjorde
præcis som den skulle. Det var en fejl i *sproget*, og den slags koster mest.

---

### 3. Kunden fik at vide, at maden kostede 10 kr.

**Hvad skete der:** Fire dage lå der en dagens ret uden pris. Kunden kunne bestille,
og kurven skrev "i alt 10 kr." — det var emballagen. Køkkenet stod med den samtale
ved lugen.

**Reglen:** En manglende pris er ikke nul. Vis aldrig en total, der ikke er hele
beløbet. Enten spærrer I for bestilling af varen og giver telefonnummeret, eller også
skriver I ærligt *"+ varer uden pris — dem oplyser vi ved afhentning"*. Byg det i
tre lag: advarsel i admin når en ret har navn men ingen pris, spærring på
bestillingssiden, og en ærlig total i kurven.

---

### 4. Køkkenet kunne ikke se, hvad der var bestilt

**Hvad skete der:** Panini fandtes med to slags fyld. Valget stod i *beskrivelsen*:
"Skinke/ost eller kylling/ost/pesto". Bestillingen kom ind i køkkenet som bare
**"Panini"**. Hver gang kostede det et opkald eller en forkert portion.

**Reglen:** Alt kunden skal vælge, skal være **data** — ikke tekst i en beskrivelse.
Et rigtigt felt, der følger bestillingen hele vejen: kurv → kvittering → køkkenets
seddel → salgsstatistik. Bonus: så kan I bagefter se, om det er skinken eller
pestoen der sælger.

Byg det som én mekanisme, der virker på både dagens ret og det faste sortiment. Hos
Spiis blev det først bygget til dagens ret og skulle senere udvides — det kostede
en runde ekstra.

**Detalje der viste sig at være vigtig:** giv hver mulighed sit eget antal-tælleværk
i stedet for én vare plus en rullemenu. Så kan man bestille to med skinke og én med
pesto i samme bestilling. Og fordi der ikke findes en linje uden et valg, *kan* man
ikke komme til at bestille "bare en panini" — kravet håndhæver sig selv, uden ekstra
validering.

---

### 5. Siden gav op efter første forsøg

**Hvad skete der:** Databasen lå nede i en time — lige før åbningstid. Den kom op
igen, men hjemmesiden og admin blev ved med at være døde, indtil nogen huskede at
genindlæse. Køkkenet opdagede det først længe efter.

**Årsagen:** Ramte siden en lukket database ved indlæsning, satte den sig i
offline-tilstand og prøvede **aldrig igen**.

**Reglen:** Enhver forbindelse, der kan fejle, skal prøve igen af sig selv — med
stigende mellemrum (2, 4, 8, 16, 30 sekunder). Og når den kommer på igen, skal
siden hente sig selv ind **uden at nogen rører noget**. Et køkken midt i en vagt har
ikke overskud til at fejlsøge.

---

## DEL 2 — NÅR DATABASEN ER NEDE

Det her er værd at bygge rigtigt fra starten, for det *vil* ske.

### Ingen må kunne bestille — og de skal vide hvorfor

Tre lag, i den rækkefølge:

1. **Bestil-knappen slås fra**, og der står en besked med telefonnummeret:
   *"Online-bestilling er nede i øjeblikket. Ring til os på …, så klarer vi det over
   telefonen."*
2. **Falder forbindelsen midt i en bestilling**, får kunden en nødudgang:
   *"Din bestilling er **ikke** sendt endnu — vi siger det ærligt, i stedet for at
   love noget vi ikke kan holde. Alt hvad du har skrevet står der stadig."*
   Plus tre knapper: prøv igen, send som sms, ring.
3. **Gem ALDRIG bestillingen lokalt som en nødløsning.** Den ville kun ligge i
   kundens egen browser og aldrig nå køkkenet — og kunden ville tro, de havde
   bestilt. En ærlig fejl er bedre end en falsk kvittering. Det her er den eneste
   grund til, at ingen mødte op forgæves under nedbruddet.

### Login må ikke bede om noget, det ikke kan bruge

**Hvad skete der:** Uden forbindelse faldt login tilbage til en gammel nød-PIN, som
ingen i køkkenet kender. De skrev den rigtige adgangskode, og skærmen svarede
**"Forkert PIN"**. De troede, de tastede forkert. Det gjorde de ikke.

**Reglen:** Er systemet ikke klar, så **slå feltet fra** og skriv hvorfor — og skriv
udtrykkeligt, at det ikke er deres skyld. Skift selv tilbage, når forbindelsen er
der. Skeln mellem "vi er ved at forbinde" (helt normalt, varer et øjeblik) og
"databasen har sagt fra" — kun den anden skal lyde alvorlig.

### En gammel side skal opdage sig selv

En telefon kan have haft siden liggende i en fane siden i går. Databasen siger nu nej
til alt det forældede — men det er en dårlig oplevelse at få nej *først*, efter man
har bekræftet.

Løsning: er sidens tal blevet gamle (fx over et halvt minut), hentes friske **før**
kunden får kvitteringen at se. Med en kort tålmodighed — 4 sekunder — så dårligt wifi
ikke spærrer for en bestilling, databasen alligevel skal godkende.

---

## DEL 3 — DATAMÆNGDEN (den der kan lukke jer ned)

Supabase' gratis plan giver **5 GB udgående data om måneden**. Spiis brugte 6,17 GB
og fik en frist på tre uger, før de begyndte at afvise kald.

**Årsagen var ikke travlhed. Det var spild:**

Admin hentede **alle bestillinger fra 60 dage plus hele menukortet — hvert 10.
sekund**, også når iPad'en lå slukket på køkkenbordet. Én skærm tændt en arbejdsdag
blev til omkring 3.600 fulde hentninger.

**Den rigtige model — og den er både billigere OG hurtigere:**

| | |
|---|---|
| Hvert 10. sekund | Stil et **lillebitte** spørgsmål: *"hvornår kom den nyeste bestilling ind?"* — ét felt, én række, under hundrede tegn |
| Er svaret uændret | Hent **ingenting** |
| Er der noget nyt | Hent hele listen **straks** |
| Skærmen slukket / fanen i baggrunden | Hent **ingenting** — men hent friskt i samme sekund den vågner |
| Hele listen alligevel en gang imellem | Hvert 5. minut som sikkerhedsnet, så ændringer fra en *anden* skærm også kommer med |

Målt hos Spiis: **en ny bestilling opdages efter 3 sekunder**, og der spørges 3 gange
på 35 sekunder. Altså hurtigere end den gamle model, til en brøkdel af datamængden.

**Brug realtime — men stol ikke blindt på den.** Supabase kan skubbe ændringer ud
inden for et sekund. Det er dejligt, men den kan falde ud uden at sige det. Derfor
skal det lille spørgsmål køre uanset hvad. Realtime er fart; spørgsmålet er garanti.

**Hvis I rammer PGRST002 ("Could not query the database for the schema cache"):**
Postgres selv er typisk rask — det er laget imellem, der er gået ned.
**Settings → General → Restart project.** Det tager to minutter og rører ingen data.

---

## DEL 4 — REGLER FOR SELVE DATABASEN

### Én række, der låses — så kan to kunder ikke købe den samme sidste portion

Al modtagelse af bestillinger går gennem **én** funktion i databasen
(`SECURITY DEFINER`), aldrig direkte INSERT fra browseren. Det første den gør er:

```sql
select data into v_cfg from config where id = 1 for update;
```

Den `for update` låser rækken, så bestillinger behandles én ad gangen. To kunder,
der trykker samtidig på den sidste portion, kan ikke begge få ja. Uden den lås har I
en fejl, der kun viser sig, når der er travlt — altså præcis når den gør mest skade.

### Samme bestilling to gange må kun tælle én gang

Dårligt wifi i en idrætsforening betyder, at kunden trykker send flere gange. Giv
hver bestilling et kvitteringsnummer, kunden beholder ved genforsøg, og en `unique`
på det i databasen. Så siger databasen bare ja igen i stedet for at oprette den to
gange.

### Skriv aldrig en migration, der erstatter en funktion, I ikke har læst

Da åbningstids-tjekket skulle ind, fandtes der **seks forskellige udgaver** af
bestillingsfunktionen i repoet, og det var ikke til at vide, hvilken der kørte i
produktion. At skrive sin egen ovenpå kunne have fjernet noget, de allerede havde.

**Løsningen:** lad migrationen læse den funktion, der faktisk kører, og sætte ét tjek
ind i den:

```sql
select pg_get_functiondef(p.oid) into v_src from pg_proc p ... where proname='place_order';
if position('MIT-TJEK' in v_src) > 0 then return; end if;   -- allerede der
if position(v_anker in v_src) = 0 then raise exception '...'; end if;  -- rør intet
execute replace(v_src, v_anker, v_anker || v_tjek);
```

Så kan intet gå tabt: enten sættes tjekket ind i det, der er, eller også stopper den
og ændrer ingenting. Vælg et anker, der er ordret ens i alle udgaver — hos Spiis var
`select data into v_cfg from config where id = 1 for update;` identisk i alle 15
forekomster.

Slut migrationen af med en oversigt, der printer **ja/NEJ** for hver spærring, så
man kan se med det samme, at intet er væk.

---

## DEL 5 — SÅDAN TESTER MAN NOGET, DER IKKE MÅ GÅ NED

Det her er den enkeltstående vane, der har fanget flest fejl.

### Byg en falsk database, du kan slukke for

Et lille script på ~50 linjer, der svarer som Supabase, og som kan sættes til at
svare 503. Så kan I teste det, man ellers aldrig får testet:

- Hvad ser køkkenet, når databasen er nede?
- Kommer siden på igen af sig selv, når den kommer op — uden genindlæsning?
- Kan en kunde komme til at bestille, mens den er nede?
- Hvor mange gange henter admin data på 35 sekunder?
- Hvad sker der, hvis køkkenet lukker dagen, mens kunden har siden åben?

Lad den falske database **tælle hentninger**. Det var sådan datamængde-problemet
blev både bevist og målt bagefter.

### Test SQL mod en rigtig Postgres, før du rører produktion

`apt install postgresql` og kør den lokalt. Læg jeres **egen** konfiguration og
**egen** bestillingsfunktion ind, og kør så migrationen.

Da det blev gjort for åbningstids-tjekket, fandt det to ting på fem minutter:
en ægte syntaksfejl i SQL'en (Postgres kan ikke sætte to `E'…'`-strenge sammen uden
`||`), **og** beviset for at hullet var ægte — fredag svarede `{"ok": true}` før
ændringen og `"lukket"` efter. Uden den test havde det været et gæt.

Kør altid **før-tilstanden** i testen. Kan I ikke fremvise fejlen før rettelsen, ved
I ikke, om I har rettet noget.

### Skriv testens navne på dansk, som noget der kan ske

`✓ ligger iPad'en og sover, hentes der INTET` siger mere end
`✓ pollingInterval respects visibility state`. Når en test fejler klokken 23, skal
navnet fortælle dig, hvad kunden eller køkkenet mister.

### To fælder i browsertests

- **`content-visibility: auto` gør `innerText` tom** for alt uden for skærmen. Kald
  `scrollIntoView()` først, ellers tester I ingenting og tror, det gik godt.
- **Inputfelters værdi tæller ikke med i `innerText`.** Tjek `input.value`, ikke
  sidens tekst, når I vil vide, hvad der står i et felt.
- Når en test fejler: **tjek altid om det er testen eller koden.** Flere gange hos
  Spiis var det testen — en gammel test der udfyldte et felt, som nu var skjult, og
  en der fejlede fordi containerens ur var gået forbi bestillingsfristen. `git stash`
  og kør igen: fejler den også *uden* dine ændringer, er det ikke dig.

---

## DEL 6 — SMÅTING DER HAR KOSTET TID

- **Nulstil altid, når du gentegner.** En liste over flere dagens retter blev hængende
  hen over gentegninger, fordi den ikke blev tømt først. Resultatet var to retters
  navne klistret sammen til én overskrift.
- **En tekst må kun stå ét sted.** Lav én funktion, der bestemmer hvad en bestillings­linje
  hedder (`navn · valg`), og brug den i kurven, kvitteringen, sms'en, køkkenets seddel
  og statistikken. Ellers siger de fem steder før eller siden noget forskelligt.
- **Telefonnumre skal kunne trykkes.** `<a href="tel:+45…">`. Og hent nummeret fra
  konfigurationen ét sted, så et nyt nummer ikke skal rettes ni steder.
- **Afbestillingsfrister er ikke ens for alt.** Dagens ret: "ring senest 1 time før".
  Tapas, der købes ind og anrettes dagen før: "senest dagen før". Samme boks, to
  tekster — ellers lover I noget, køkkenet ikke kan holde.
- **Kontroller at en ændring ikke forsvinder ved næste tastetryk.** Admin-felter, der
  gemmer automatisk, samler ofte hele formularen op og skriver den tilbage. Glemmer
  den at læse et nyt felt med, bliver det slettet i samme sekund brugeren skriver i
  et andet felt. Test: sæt en værdi, skriv i et *andet* felt, og se om den første
  stadig er der.

---

## DEL 7 — ARBEJDSGANGEN

Det her er ikke kode, men det er grunden til, at Spiis stadig kører.

**To grene.** Udviklingsgrenen udgiver *ikke*. Kun én bestemt gren går live. Så kan
noget ligge færdigt og testet, uden at det rammer et køkken midt i en vagt. Når
chefen siger go, flyttes det over — og først dér går det live.

**Intet går live uden et ja.** Hver gang. Også små ting. Især små ting.

**Vis deployet er grønt bagefter**, og sig ærligt hvad du *ikke* kunne verificere.

**Stempl filerne med et versionsnummer ved deploy**, så en telefon aldrig kan blande
gammel og ny kode sammen efter en opdatering.

**Skriv commit-beskeder til mennesket, ikke til maskinen.** Hvad oplevede køkkenet,
hvorfor skete det, hvad blev ændret, og hvad blev testet. Om et halvt år er det den
eneste forklaring, der er tilbage.

---

## Den korte version

Hvis I kun husker fem ting:

1. **Databasen skal afvise alt det, hjemmesiden afviser.** Browseren kan være dage gammel.
2. **Aldrig en falsk kvittering.** En ærlig fejl med et telefonnummer slår en kvittering, køkkenet aldrig ser.
3. **Spørg småt og tit — hent stort og sjældent.** Det er både hurtigere og billigere.
4. **Prøv igen af dig selv.** Alt der kan fejle, skal komme sig uden at nogen rører det.
5. **Byg en falsk database, du kan slukke for.** Ellers tester I aldrig det, der faktisk vælter jer.
