#!/usr/bin/env python3
"""
Standalone data pipeline for The Finals Skin Library website.

Scrapes thefinals.wiki and outputs data/web_skins.json with pre-computed
S/A/B/C/D tier and estimated MFC value for every skin.

Usage:
  python data/prepare_web_data.py                          # scrape wiki (GitHub Actions)
  python data/prepare_web_data.py --local PATH/skin_db.json  # read from local file
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_PATH = os.path.join(SCRIPT_DIR, "web_skins.json")

# ---------------------------------------------------------------------------
# Scoring logic  (inlined from data/scoring.py)
# ---------------------------------------------------------------------------

SOURCE_SCORE: dict[str, int] = {
    "Close Beta":    10,
    "Open Beta":     9,
    "Event":         8,
    "Twitch Drop":   7,
    "Sponsor":       6,
    "BP Bonus Page": 5,
    "Quest":         4,
    "Battle Pass":   3,
    "Ranked":        4,
    "Real Cash":     2,
    "Special Pass":  2,
    "Store":         1,
    "Default":       0,
}

RANKED_TIER_BONUS: dict[str, int] = {
    "Diamond": 3_000_000,
    "Ruby":    2_000_000,
    "Emerald": 1_000_000,
    "Gold":    0,
}

WILL_NOT_RETURN_BONUS = 5_000_000
MAX_SEASONS = 20

SOURCE_TIER: dict[str, str] = {
    "Close Beta":    "S",
    "Open Beta":     "S",
    "Event":         "A",
    "Twitch Drop":   "A",
    "Sponsor":       "B",
    "BP Bonus Page": "B",
    "Quest":         "C",
    "Battle Pass":   "C",
    "Ranked":        "C",
    "Real Cash":     "D",
    "Special Pass":  "D",
    "Store":         "D",
    "Default":       "D",
}

_PROMOTE: dict[str, str] = {"S": "S", "A": "S", "B": "A", "C": "A", "D": "A"}

TIER_LABELS: dict[str, str] = {
    "S": "Unobtainable",
    "A": "Highly Limited",
    "B": "Ranked / Special",
    "C": "Earnable",
    "D": "Basic",
}

RARITY_VALUE: dict[str, int] = {
    "MYTHIC":    2400,
    "LEGENDARY": 1200,
    "EPIC":      800,
    "RARE":      500,
    "COMMON":    0,
}

SOURCE_VALUE_MULT: dict[str, float] = {
    "Close Beta":    12.0,
    "Open Beta":     10.0,
    "Event":          4.0,
    "Twitch Drop":    3.5,
    "Sponsor":        3.0,
    "BP Bonus Page":  2.5,
    "Quest":          1.8,
    "Battle Pass":    1.5,
    "Ranked":         2.0,
    "Real Cash":      1.0,
    "Special Pass":   1.0,
    "Store":          1.0,
    "Default":        0.0,
}

RANKED_VALUE_BONUS: dict[str, int] = {
    "Diamond": 3000,
    "Ruby":    2000,
    "Emerald": 1000,
    "Gold":    400,
}


def get_tier(skin: dict) -> str:
    ranked_tier = skin.get("ranked_tier")
    will_not_return = skin.get("will_not_return", False)
    if ranked_tier:
        base = {"Diamond": "A", "Ruby": "B", "Emerald": "B", "Gold": "C"}.get(ranked_tier, "C")
        return _PROMOTE[base] if will_not_return else base
    source = skin.get("source", "Store")
    base = SOURCE_TIER.get(source, "D")
    if will_not_return:
        return _PROMOTE[base]
    return base


def estimate_value(skin: dict) -> int:
    source  = skin.get("source", "Store")
    rarity  = skin.get("rarity", "COMMON")
    cost    = skin.get("cost") or 0
    wnr     = skin.get("will_not_return", False)
    r_tier  = skin.get("ranked_tier")
    if source == "Store" and cost > 0:
        return int(cost * 1.5) if wnr else cost
    rarity_base = RARITY_VALUE.get(rarity, 0)
    mult        = SOURCE_VALUE_MULT.get(source, 1.0)
    ranked_bonus = RANKED_VALUE_BONUS.get(r_tier, 0) if r_tier else 0
    value = int(rarity_base * mult) + ranked_bonus
    if wnr:
        value = int(value * 1.6)
    return max(value, 0)


def compute_score(skin: dict) -> int:
    source = skin.get("source", "Store")
    source_base = SOURCE_SCORE.get(source, 1) * 1_000_000
    ranked_tier = skin.get("ranked_tier")
    tier_bonus = RANKED_TIER_BONUS.get(ranked_tier, 0) if ranked_tier else 0
    wnr_bonus = WILL_NOT_RETURN_BONUS if skin.get("will_not_return") else 0
    season_str = skin.get("season")
    if season_str and season_str.startswith("Season "):
        try:
            season_num = int(season_str.split(" ")[1])
        except (IndexError, ValueError):
            season_num = MAX_SEASONS
    else:
        season_num = 0
    season_bonus = (MAX_SEASONS - season_num) * 1_000
    bp_tier = skin.get("bp_tier") or 0
    return source_base + tier_bonus + wnr_bonus + season_bonus + bp_tier


# ---------------------------------------------------------------------------
# Scraper logic  (inlined from data/scraper.py)
# ---------------------------------------------------------------------------

BASE_URL = "https://www.thefinals.wiki"

WEAPONS = {
    "Light": [
        "93R", "ARN-220", "Dagger", "LH1", "M11", "M26 Matter",
        "Recurve Bow", "SH1900", "SR-84", "Sword", "Throwing Knives", "V9S", "XP-54",
    ],
    "Medium": [
        "AKM", "CB-01 Repeater", "Cerberus 12GA", "CL-40", "Dual Blades",
        "FAMAS", "FCAR", "Model 1887", "P90", "Pike-556", "R.357", "Riot Shield",
    ],
    "Heavy": [
        ".50 Akimbo", "BFR Titan", "Flamethrower", "KS-23", "Lewis Gun",
        "M134 Minigun", "M60", "MGL32", "SA1216", "ShAK-50", "Sledgehammer", "Spear",
    ],
}

SLUG_OVERRIDES = {
    ".50 Akimbo": ".50_Akimbo",
    "M26 Matter": "M26_Matter",
    "CB-01 Repeater": "CB-01_Repeater",
    "Cerberus 12GA": "Cerberus_12GA",
    "Dual Blades": "Dual_Blades",
    "Model 1887": "Model_1887",
    "Pike-556": "Pike-556",
    "Riot Shield": "Riot_Shield",
    "Recurve Bow": "Recurve_Bow",
    "Throwing Knives": "Throwing_Knives",
    "M134 Minigun": "M134_Minigun",
    "BFR Titan": "BFR_Titan",
    "Lewis Gun": "Lewis_Gun",
    "ShAK-50": "ShAK-50",
}

SOURCE_KEYWORDS = {
    "Close Beta":    ["closed beta", "close beta", "beta exclusive", "cb "],
    "Open Beta":     ["open beta", "ob "],
    "Twitch Drop":   ["twitch drop", "twitch"],
    "Sponsor":       ["sponsor"],
    "BP Bonus Page": ["bonus page"],
    "Quest":         ["quest"],
    "Battle Pass":   ["bp level", "battle pass", "battlepass", "s1 bp", "s2 bp",
                      "s3 bp", "s4 bp", "s5 bp", "s6 bp", "s7 bp"],
    "Special Pass":  ["special pass"],
    "Event":         ["event", "limited time", "seasonal"],
    "Ranked":        ["ranked"],
    "Store":         ["multibucks", "shop"],
    "Default":       ["default", "base", "free"],
}

_TIMEOUT = 30
_RETRIES = 3


def _get_session():
    import requests
    s = requests.Session()
    s.headers.update({"User-Agent": "TheFinalsStats-Scraper/1.0 (educational skin tracker)"})
    return s


def _get_with_retry(session, url: str):
    import requests
    last_exc = requests.RequestException(f"Failed after {_RETRIES} retries")
    for _ in range(_RETRIES):
        try:
            return session.get(url, timeout=_TIMEOUT)
        except requests.RequestException as exc:
            last_exc = exc
    raise last_exc


def _get_weapon_slug(weapon_name: str) -> str:
    return SLUG_OVERRIDES.get(weapon_name, weapon_name.replace(" ", "_"))


def _infer_source(plaque_text: str) -> str:
    text_lower = plaque_text.lower()
    for source, keywords in SOURCE_KEYWORDS.items():
        for kw in keywords:
            if kw in text_lower:
                return source
    if re.fullmatch(r"\d+", plaque_text.strip()):
        return "Store"
    return "Store"


def _extract_cost(plaque_text: str) -> int:
    numbers = re.findall(r"\b(\d{3,5})\b", plaque_text)
    return int(numbers[0]) if numbers else 0


def scrape_weapon_page(session, weapon_name: str, build: str) -> list[dict]:
    from bs4 import BeautifulSoup
    slug = _get_weapon_slug(weapon_name)
    url = f"{BASE_URL}/wiki/{slug}"
    skins = []
    try:
        resp = _get_with_retry(session, url)
        if resp.status_code != 200:
            print(f"  [!] {weapon_name}: HTTP {resp.status_code}")
            return []
        soup = BeautifulSoup(resp.text, "html.parser")
        skins_headline = soup.find("span", {"id": "Skins"})
        if not skins_headline:
            print(f"  [-] {weapon_name}: no Skins section")
            return []
        tabber = None
        for candidate in skins_headline.find_all_next("div", class_="tabber"):
            if candidate.find("div", class_="cosmetic-card"):
                tabber = candidate
                break
        if not tabber:
            print(f"  [-] {weapon_name}: no cosmetic-cards found")
            return []
        _VALID_RARITIES = {"MYTHIC", "LEGENDARY", "EPIC", "RARE", "COMMON"}
        for panel in tabber.find_all("article", class_="tabber__panel"):
            panel_id = panel.get("id", "")
            rarity = re.sub(r"_\d+$", "", panel_id.replace("tabber-", "")).upper()
            if rarity not in _VALID_RARITIES:
                continue
            for card in panel.find_all("div", class_="cosmetic-card"):
                name_div = card.find("div", class_="cosmetic-card__name")
                if not name_div:
                    continue
                name_anchor = name_div.find("a")
                skin_name = name_div.get_text(strip=True)
                if not skin_name:
                    continue
                cosmetic_url = None
                if name_anchor:
                    href = name_anchor.get("href", "")
                    if href:
                        cosmetic_url = href if href.startswith("http") else BASE_URL + href
                img_url = None
                for img_tag in card.find_all("img"):
                    src = img_tag.get("src", "")
                    alt = img_tag.get("alt", "")
                    if src and "LimitedTimeIcon" not in src and "Icon" not in alt:
                        img_url = src if src.startswith("http") else BASE_URL + src
                        break
                plaques = card.find_all("div", class_=re.compile(r"template-plaque"))
                combined_plaque = " ".join(p.get_text(strip=True) for p in plaques)
                will_not_return = any(
                    "will not return" in (img.get("alt", "").lower())
                    for img in card.find_all("img")
                )
                ranked_tier = None
                _m = re.search(r"\bS\d+\s+(Gold|Emerald|Ruby|Diamond)\b", combined_plaque, re.IGNORECASE)
                if _m:
                    ranked_tier = _m.group(1).capitalize()
                source = "Ranked" if ranked_tier else _infer_source(combined_plaque)
                cost = _extract_cost(combined_plaque)
                skin_id = (
                    f"{slug.lower()}_{skin_name.lower().replace(' ', '_')}"
                    .replace(".", "").replace("-", "_")
                )
                skins.append({
                    "id": skin_id,
                    "name": skin_name,
                    "weapon": weapon_name,
                    "build": build,
                    "full_name": f"{weapon_name} {skin_name}",
                    "rarity": rarity,
                    "cost": cost,
                    "source": source,
                    "ranked_tier": ranked_tier,
                    "will_not_return": will_not_return,
                    "season": None,
                    "bp_tier": None,
                    "obtainable": not will_not_return,
                    "image_url": img_url,
                    "cosmetic_url": cosmetic_url,
                })
        if skins:
            print(f"  [+] {weapon_name}: {len(skins)} skin(s)")
        else:
            print(f"  [-] {weapon_name}: 0 skins found")
    except Exception as exc:
        print(f"  [!] {weapon_name}: {exc}")
    return skins


def scrape_all() -> list[dict]:
    session = _get_session()
    all_skins = {}
    total = sum(len(v) for v in WEAPONS.values())
    done = 0
    for build, weapons in WEAPONS.items():
        print(f"\n[{build}]")
        for weapon_name in weapons:
            done += 1
            print(f"  ({done}/{total}) {weapon_name}")
            for entry in scrape_weapon_page(session, weapon_name, build):
                all_skins[entry["id"]] = entry
    return list(all_skins.values())


# ---------------------------------------------------------------------------
# Load from local skin_db.json
# ---------------------------------------------------------------------------

def load_from_local(path: str) -> list[dict]:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    # skin_db.json wraps skins in {"skins": [...]}
    if isinstance(data, dict):
        return data.get("skins", [])
    return data  # plain array fallback


# ---------------------------------------------------------------------------
# Enrich skins + write output
# ---------------------------------------------------------------------------

def enrich_and_save(skins: list[dict]) -> None:
    enriched = []
    for skin in skins:
        s = dict(skin)
        s["tier"] = get_tier(s)
        s["tier_label"] = TIER_LABELS.get(s["tier"], "")
        s["estimated_value"] = estimate_value(s)
        s["score"] = compute_score(s)
        enriched.append(s)

    # Default sort: tier → score descending
    tier_order = {"S": 0, "A": 1, "B": 2, "C": 3, "D": 4}
    enriched.sort(key=lambda x: (tier_order.get(x["tier"], 9), -x["score"]))

    output = {
        "version": "1.0",
        "last_updated": datetime.now().strftime("%Y-%m-%d"),
        "total": len(enriched),
        "skins": enriched,
    }

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"\nDone. {len(enriched)} skins written to {OUTPUT_PATH}")
    tier_counts = {}
    for s in enriched:
        tier_counts[s["tier"]] = tier_counts.get(s["tier"], 0) + 1
    for tier in ["S", "A", "B", "C", "D"]:
        print(f"  {tier}: {tier_counts.get(tier, 0)}")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate web_skins.json for The Finals Skin Library")
    parser.add_argument("--local", metavar="PATH", help="Read from local skin_db.json instead of scraping")
    args = parser.parse_args()

    if args.local:
        local_path = os.path.abspath(args.local)
        print(f"Reading from local file: {local_path}")
        skins = load_from_local(local_path)
        print(f"Loaded {len(skins)} skins.")
    else:
        try:
            import requests
            from bs4 import BeautifulSoup
        except ImportError:
            print("Missing dependencies. Run: pip install requests beautifulsoup4")
            sys.exit(1)
        print("Scraping thefinals.wiki...")
        skins = scrape_all()
        if not skins:
            print("No skins scraped — aborting.")
            sys.exit(1)
        print(f"\nTotal scraped: {len(skins)} skins")

    enrich_and_save(skins)
