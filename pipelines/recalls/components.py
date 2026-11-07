"""Sort a recall into the part of the vehicle it is about, from its hazard text.

Safety Gate has no component field, only free English text ("The separator of the high voltage battery may be
damaged ..."). The text names the faulty part first and the consequence after, so the category whose words appear
earliest wins. Rough by nature: good for statistics and filters, not for legal purposes.
"""

from __future__ import annotations

import re

# key, English label, German label, patterns (regular expressions, case-insensitive)
COMPONENTS = [
    ("airbags_belts", "Airbags and seat belts", "Airbags und Gurte",
     [r"air ?bags?", r"seat ?belts?", r"safety belts?", r"belt (?:tensioner|buckle|retractor)", r"pretensioner", r"restraint"]),
    ("brakes", "Brakes", "Bremsen",
     [r"brak(?:e|es|ing)\b", r"\bABS\b", r"\bEBS\b", r"\bcalipers?\b"]),
    ("steering", "Steering", "Lenkung",
     [r"steering", r"(?:track|tie) rods?", r"steerer tube", r"triple clamp", r"handlebars?", r"front fork"]),
    ("hv_battery", "High-voltage battery and charging", "Hochvoltbatterie und Laden",
     [r"high[- ]?voltage", r"\bHV\b", r"traction battery", r"battery (?:cells?|modules?|packs?)", r"\bcells?\b",
      r"charging (?:inlet|socket|port|cable|unit|system)", r"on-?board charger", r"\bcharger\b"]),
    ("fuel", "Fuel system", "Kraftstoffsystem",
     [r"\bfuel\b", r"\bpetrol\b", r"\bLPG\b", r"\bCNG\b", r"\bgas (?:tank|cylinder|line|pipe)", r"\btank\b"]),
    ("engine_drive", "Engine and drivetrain", "Motor und Antrieb",
     [r"\bengine\b", r"gear ?box", r"transmission", r"drive ?shaft", r"propeller shaft", r"propulsion", r"\bturbo",
      r"\bclutch\b", r"\bcoolant\b", r"\boil\b", r"crankshaft", r"camshaft", r"timing (?:belt|chain)", r"\bmotor\b",
      r"inverter", r"differential", r"power transfer unit", r"throttle", r"accelerator"]),
    ("wheels_suspension", "Wheels, tyres and suspension", "Räder, Reifen und Fahrwerk",
     [r"\bwheels?\b", r"\btyres?\b", r"\btires?\b", r"\brims?\b", r"suspension", r"control[- ]arms?", r"knuckle",
      r"\baxle", r"shock absorber", r"\bsprings?\b", r"wheel (?:bolts?|nuts?|carriers?|bearings?)", r"ball joint", r"subframe"]),
    ("electrical", "Electrical system and wiring", "Elektrik und Kabel",
     [r"wiring", r"\bcables?\b", r"\bfuses?\b", r"short[- ]circuit", r"12 ?V", r"\bbattery\b", r"alternator",
      r"starter", r"connectors?\b", r"electrical", r"\bharness"]),
    ("software_assist", "Software, cameras and assistance systems", "Software, Kameras und Assistenten",
     [r"software", r"camera", r"\bdisplay", r"instrument (?:cluster|panel)", r"control units?", r"\bECU\b",
      r"sensors?\b", r"e-?call", r"speedometer", r"warning (?:lamp|light|signal|message)", r"\bradar\b",
      r"cruise control", r"emergency (?:braking|call)", r"assist"]),
    ("lights_view", "Lights, wipers and visibility", "Licht, Wischer und Sicht",
     [r"head ?(?:lamps?|lights?)", r"\blamps?\b", r"\blights?\b", r"wipers?", r"\bmirrors?\b", r"windscreen",
      r"windshield", r"reflector"]),
    ("body_seats", "Body, doors and seats", "Karosserie, Türen und Sitze",
     [r"\bseats?\b", r"\bdoors?\b", r"bonnet", r"\bhood\b", r"\broof\b", r"\bwindows?\b", r"sunroof", r"\btrim\b",
      r"latch", r"hinges?", r"tow ?bar", r"towing", r"child lock", r"bumper", r"head ?rests?", r"tailgate", r"seat ?backs?", r"trailer (?:coupling|hitch)", r"coupling device", r"tow hook", r"bodywork",
      r"\bpanel\b", r"\bframe\b", r"chassis", r"\bweld"]),
    ("emissions", "Emissions", "Abgase",
     [r"emissions?", r"\bNOx\b", r"exhaust", r"pollutant", r"defeat device", r"particulate"]),
    ("approval", "Approval and paperwork", "Zulassung und Papiere",
     [r"approval certificate", r"counterfeit", r"type[- ]approv", r"certificate of conformity", r"labell?ing",
      r"not approved", r"marking"]),
]
OTHER = ("other", "Other", "Sonstiges")
LABELS = {k: (en, de) for k, en, de, _ in COMPONENTS} | {OTHER[0]: OTHER[1:]}
_RX = [(k, re.compile("|".join(f"(?:{p})" for p in pats), re.I)) for k, _, _, pats in COMPONENTS]
_LEGAL = re.compile(r"\s*The product does not comply with.*$", re.I | re.S)
_HV_HINT = re.compile(r"high[- ]?voltage|\bHV\b|traction battery|electric vehicle|battery cells?", re.I)


def classify(hazard: str | None) -> str:
    """Component key for a hazard text: the category named earliest, 'other' when none is named."""
    text = _LEGAL.sub("", hazard or "")
    best, where = OTHER[0], len(text) + 1
    for key, rx in _RX:
        m = rx.search(text)
        if not m or m.start() >= where:
            continue
        if key == "electrical" and m.group(0).lower() == "battery" and _HV_HINT.search(text):
            key = "hv_battery"
        best, where = key, m.start()
    return best
