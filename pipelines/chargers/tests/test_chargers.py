import json
import unittest

from pipelines.chargers import build, collect, register

HEADER = ("Ladeeinrichtungs-ID;Betreiber;Anzeigename (Karte);Status;Art der Ladeeinrichtung;Anzahl Ladepunkte;"
          "Nennleistung Ladeeinrichtung [kW];Inbetriebnahmedatum;Straße;Hausnummer;Adresszusatz;Postleitzahl;Ort;"
          "Kreis/kreisfreie Stadt;Bundesland;Breitengrad;Längengrad;Standortbezeichnung;Informationen zum Parkraum;"
          "Bezahlsysteme;Öffnungszeiten;Öffnungszeiten: Wochentage;Öffnungszeiten: Tageszeiten;"
          "Steckertypen1;Nennleistung Stecker1;EVSE-ID1;Public Key1;Steckertypen2;Nennleistung Stecker2;EVSE-ID2;Public Key2")


def row(i, op, kw, lat, lon, plug1, plug2="", pc="50667", town="Köln", pay="RFID-Karte", hours="247", park=""):
    return (f'{i};{op} GmbH;{op};In Betrieb;Normalladeeinrichtung;{2 if plug2 else 1};{kw};01.02.2021;Domkloster;4;;{pc};{town};'
            f'Köln;Nordrhein-Westfalen;{lat};{lon};;{park};"{pay}";{hours};;;{plug1};{kw};DE*X*1;;{plug2};{kw if plug2 else ""};;')


def sample_csv(rows):
    head = "Ladesäulenregister Bundesnetzagentur;;\n;;\nLetzte Aktualisierung vom: 30.09.2026;;\n;;\nAllgemeine Informationen;;\n"
    return ("﻿" + head + HEADER + "\n" + "\n".join(rows) + "\n").encode()


class RegisterTest(unittest.TestCase):
    def test_reads_csv_and_folds_points(self):
        data = sample_csv([row(1, "A", 22, "50,9413", "6,9583", "AC Typ 2 Steckdose", "AC Typ 2 Steckdose")])
        meta, rows = register.read(data, "Ladesaeulenregister_BNetzA_2026-09-30.csv")
        self.assertEqual(meta["updated"], "2026-09-30")
        self.assertEqual(meta["file_date"], "2026-09-30")
        self.assertEqual(len(rows), 1)
        self.assertEqual(len(rows[0]["points"]), 2)
        self.assertEqual(rows[0]["Breitengrad"], "50,9413")

    def test_newest_prefers_date_then_csv(self):
        base = "https://x/Ladesaeulenregister_BNetzA_"
        self.assertTrue(collect.newest([base + "2026-09-01.csv", base + "2026-09-30.xlsx"]).endswith("09-30.xlsx"))
        self.assertTrue(collect.newest([base + "2026-09-30.xlsx", base + "2026-09-30.csv"]).endswith("09-30.csv"))


class BuildTest(unittest.TestCase):
    def rows(self, lines):
        return register.read(sample_csv(lines), "r.csv")[1]

    def test_plug_bits(self):
        self.assertEqual(build.plug_bits("DC Fahrzeugkupplung Typ Combo 2 (CCS); DC CHAdeMO"), 2 | 4)
        self.assertEqual(build.plug_bits("AC Typ 2 Steckdose; AC Schuko"), 1 | 8)
        self.assertEqual(build.plug_bits("DC Megawatt Charging System (MCS)"), 16)

    def test_merges_devices_at_one_place(self):
        sts = build.stations(self.rows([
            row(1, "A", 22, "50,94130", "6,95830", "AC Typ 2 Steckdose"),
            row(2, "A", 300, "50,94131", "6,95831", "DC Fahrzeugkupplung Typ Combo 2 (CCS)", pay="Kreditkarte (NFC);RFID-Karte"),
            row(3, "B", 11, "50,95", "6,97", "AC Typ 2 Steckdose", hours="Keine Angabe", park="Nur für Kunden/Besucher", pay="Kostenlos"),
            row(4, "C", 11, "40,0", "6,97", "AC Typ 2 Steckdose"),  # outside Germany: dropped
        ]))
        self.assertEqual(len(sts), 2)
        a = next(s for s in sts if s["operator"] == "A")
        self.assertEqual((a["kw"], a["points"], a["dc_points"], a["plugs"], a["devices"]), (300, 2, 1, 1 | 2, 2))
        self.assertTrue(a["flags"] & build.FLAGS["card"] and a["flags"] & build.FLAGS["24/7"])
        b = next(s for s in sts if s["operator"] == "B")
        self.assertEqual(b["flags"], build.FLAGS["free"] | build.FLAGS["customers_only"])

    def test_postcode_padding_and_misplaced(self):
        lines = [row(i, "A", 22, f"51,0{i}", "13,7", "AC Typ 2 Steckdose", pc="1067", town="Dresden") for i in range(1, 5)]
        lines.append(row(9, "Z", 22, "52,52", "13,405", "AC Typ 2 Steckdose", pc="1067", town="Dresden"))  # placed in Berlin
        sts = build.stations(self.rows(lines))
        self.assertTrue(all(s["postcode"] == "01067" for s in sts))
        bad = build.misplaced(sts)
        self.assertEqual([s["operator"] for s in bad], ["Z"])

    def test_cells_and_files(self):
        sts = build.stations(self.rows([row(1, "A", 22, "50,9413", "6,9583", "AC Typ 2 Steckdose"),
                                        row(2, "B", 150, "52,52", "13,40", "DC Fahrzeugkupplung Typ Combo 2 (CCS)")]))
        cells = build.cells(sts)
        self.assertEqual(sorted(cells), ["101_13", "105_26"])
        c = cells["101_13"]
        st = dict(zip(c["fields"], c["stations"][0]))
        self.assertEqual((st["kw"], c["operators"][st["operator"]]), (22, "A"))
        ov = build.overview(sts)
        self.assertEqual(sum(r[2] for r in ov["squares"]), 2)
        self.assertEqual(sum(r[5] for r in ov["squares"]), 1)
        self.assertIn("Köln", json.dumps(build.places(sts), ensure_ascii=False))
        self.assertTrue(build.stations_csv(sts).decode().startswith("lat,lon,kw"))


if __name__ == "__main__":
    unittest.main()
