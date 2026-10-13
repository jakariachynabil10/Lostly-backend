import { MatchFactor, MatchResult } from "../types";

// Standard stop words for token comparison
const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "in", "on", "at", "to", "for", "with",
  "of", "by", "from", "my", "your", "is", "was", "were", "it", "this",
  "that", "there", "i", "lost", "found", "item"
]);

// Normalize and tokenize text
export function tokenize(text?: string | null): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word));
}

// Jaccard similarity between two token arrays
export function jaccardSimilarity(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

// Jaro-Winkler distance implementation for string similarity
export function jaroWinkler(s1: string, s2: string): number {
  const str1 = s1.trim().toLowerCase();
  const str2 = s2.trim().toLowerCase();

  if (str1 === str2) return 1.0;
  if (!str1 || !str2) return 0.0;

  const matchWindow = Math.floor(Math.max(str1.length, str2.length) / 2) - 1;
  const str1Matches = new Array(str1.length).fill(false);
  const str2Matches = new Array(str2.length).fill(false);

  let matches = 0;
  for (let i = 0; i < str1.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, str2.length);

    for (let j = start; j < end; j++) {
      if (str2Matches[j]) continue;
      if (str1[i] !== str2[j]) continue;
      str1Matches[i] = true;
      str2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < str1.length; i++) {
    if (!str1Matches[i]) continue;
    while (!str2Matches[k]) {
      k++;
    }
    if (str1[i] !== str2[k]) {
      transpositions++;
    }
    k++;
  }

  const jaro =
    (matches / str1.length +
      matches / str2.length +
      (matches - transpositions / 2) / matches) /
    3;

  // Prefix scale (up to 4 matching chars)
  let prefix = 0;
  for (let i = 0; i < Math.min(4, Math.min(str1.length, str2.length)); i++) {
    if (str1[i] === str2[i]) {
      prefix++;
    } else {
      break;
    }
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

// Color synonyms / families
const COLOR_FAMILIES: Record<string, string[]> = {
  black: ["black", "charcoal", "dark", "matte black", "jet black"],
  white: ["white", "ivory", "cream", "pearl", "off-white"],
  silver: ["silver", "grey", "gray", "metallic", "space grey", "titanium"],
  blue: ["blue", "navy", "dark blue", "light blue", "cyan", "azure", "teal", "indigo"],
  red: ["red", "maroon", "burgundy", "crimson", "ruby", "scarlet"],
  green: ["green", "olive", "emerald", "lime", "forest green", "mint"],
  yellow: ["yellow", "gold", "golden", "amber", "mustard"],
  brown: ["brown", "tan", "beige", "khaki", "chocolate", "bronze"],
  pink: ["pink", "rose", "magenta", "blush", "salmon", "coral"],
  purple: ["purple", "violet", "lavender", "plum", "lilac"],
  orange: ["orange", "peach", "rust", "tangerine"],
};

export function compareColors(
  c1?: string | null,
  c2?: string | null
): { score: number; matched: boolean; details: string } {
  if (!c1 || !c2) {
    return {
      score: 0.5, // neutral if one or both omitted
      matched: false,
      details: "Color not specified for one or both items",
    };
  }

  const norm1 = c1.trim().toLowerCase();
  const norm2 = c2.trim().toLowerCase();

  if (norm1 === norm2) {
    return { score: 1.0, matched: true, details: `Exact color match: ${c1}` };
  }

  // Check color family
  for (const [, synonyms] of Object.entries(COLOR_FAMILIES)) {
    const has1 = synonyms.some((s) => norm1.includes(s));
    const has2 = synonyms.some((s) => norm2.includes(s));
    if (has1 && has2) {
      return {
        score: 0.85,
        matched: true,
        details: `Similar color family match: "${c1}" & "${c2}"`,
      };
    }
  }

  // Substring or jaro
  const stringSim = jaroWinkler(norm1, norm2);
  if (stringSim > 0.8) {
    return {
      score: stringSim,
      matched: true,
      details: `High color resemblance: "${c1}" & "${c2}"`,
    };
  }

  return {
    score: 0.0,
    matched: false,
    details: `Different colors: "${c1}" vs "${c2}"`,
  };
}

export function compareBrands(
  b1?: string | null,
  b2?: string | null
): { score: number; matched: boolean; details: string } {
  if (!b1 || !b2) {
    return {
      score: 0.4,
      matched: false,
      details: "Brand not specified on one or both items",
    };
  }

  const norm1 = b1.trim().toLowerCase();
  const norm2 = b2.trim().toLowerCase();

  if (norm1 === norm2) {
    return { score: 1.0, matched: true, details: `Exact brand match: ${b1}` };
  }

  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    return {
      score: 0.9,
      matched: true,
      details: `Brand variant match: "${b1}" & "${b2}"`,
    };
  }

  const sim = jaroWinkler(norm1, norm2);
  if (sim >= 0.8) {
    return {
      score: sim,
      matched: true,
      details: `Similar brand spelling: "${b1}" & "${b2}"`,
    };
  }

  return {
    score: 0.0,
    matched: false,
    details: `Different brands: "${b1}" vs "${b2}"`,
  };
}

export function compareLocations(
  loc1: string,
  loc2: string
): { score: number; matched: boolean; details: string } {
  const norm1 = loc1.trim().toLowerCase();
  const norm2 = loc2.trim().toLowerCase();

  if (norm1 === norm2) {
    return { score: 1.0, matched: true, details: `Exact location: ${loc1}` };
  }

  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    return {
      score: 0.85,
      matched: true,
      details: `Location overlap: "${loc1}" & "${loc2}"`,
    };
  }

  const tokens1 = tokenize(loc1);
  const tokens2 = tokenize(loc2);
  const jaccard = jaccardSimilarity(tokens1, tokens2);
  const jaro = jaroWinkler(norm1, norm2);

  const bestScore = Math.max(jaccard, jaro * 0.8);

  if (bestScore >= 0.5) {
    return {
      score: Math.min(1.0, bestScore),
      matched: true,
      details: `Nearby / related location match: "${loc1}" & "${loc2}"`,
    };
  }

  return {
    score: Math.max(0.1, bestScore),
    matched: false,
    details: `Different locations: "${loc1}" vs "${loc2}"`,
  };
}

export function compareDates(
  lostDate: Date,
  foundDate: Date
): { score: number; matched: boolean; details: string } {
  const diffMs = Math.abs(foundDate.getTime() - lostDate.getTime());
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // If found is before lost by more than 1 day, it's less likely but possible due to estimate errors
  let score = 0;
  if (diffDays === 0) {
    score = 1.0;
  } else if (diffDays <= 2) {
    score = 0.9;
  } else if (diffDays <= 5) {
    score = 0.8;
  } else if (diffDays <= 10) {
    score = 0.65;
  } else if (diffDays <= 20) {
    score = 0.45;
  } else if (diffDays <= 30) {
    score = 0.25;
  } else {
    score = 0.1;
  }

  const matched = diffDays <= 7;
  return {
    score,
    matched,
    details:
      diffDays === 0
        ? "Reported on the same day"
        : `Reported within ${diffDays} day${diffDays === 1 ? "" : "s"} of each other`,
  };
}

export function compareDescriptions(
  desc1: string,
  desc2: string,
  extra1?: string | null,
  extra2?: string | null
): { score: number; matched: boolean; details: string } {
  const fullText1 = `${desc1} ${extra1 || ""}`;
  const fullText2 = `${desc2} ${extra2 || ""}`;

  const tokens1 = tokenize(fullText1);
  const tokens2 = tokenize(fullText2);

  const jaccard = jaccardSimilarity(tokens1, tokens2);

  // Common keywords matching
  const common = tokens1.filter((t) => tokens2.includes(t));
  const uniqueCommon = Array.from(new Set(common));

  if (jaccard >= 0.4 || uniqueCommon.length >= 3) {
    return {
      score: Math.min(1.0, Math.max(jaccard * 1.5, 0.7)),
      matched: true,
      details: `Matched features/keywords: ${uniqueCommon.slice(0, 4).join(", ")}`,
    };
  } else if (uniqueCommon.length >= 1) {
    return {
      score: Math.min(0.6, 0.3 + uniqueCommon.length * 0.1),
      matched: true,
      details: `Partial keyword overlap: ${uniqueCommon.slice(0, 3).join(", ")}`,
    };
  }

  return {
    score: 0.15,
    matched: false,
    details: "Low description correlation",
  };
}

export function compareImages(
  img1?: string | null,
  img2?: string | null
): { score: number; matched: boolean; details: string } {
  // If both have images, provide baseline image comparison score (Phase 1 provides extensible heuristic)
  if (img1 && img2) {
    return {
      score: 0.8,
      matched: true,
      details: "Both reports include photo verification",
    };
  }
  if (img1 || img2) {
    return {
      score: 0.5,
      matched: false,
      details: "Photo provided for one item",
    };
  }
  return {
    score: 0.3,
    matched: false,
    details: "No photos uploaded",
  };
}

export function calculateReportSimilarity(
  lostReport: {
    itemName: string;
    categoryId: string;
    categoryName?: string;
    brand?: string | null;
    color?: string | null;
    description: string;
    identifyingFeatures?: string | null;
    location: string;
    date: Date;
    imageUrl?: string | null;
  },
  foundReport: {
    itemName: string;
    categoryId: string;
    categoryName?: string;
    brand?: string | null;
    color?: string | null;
    description: string;
    identifyingFeatures?: string | null;
    location: string;
    date: Date;
    imageUrl?: string | null;
  }
): MatchResult {
  const factors: MatchFactor[] = [];

  // 1. Category (Weight: 10)
  const categoryMatched = lostReport.categoryId === foundReport.categoryId;
  const categoryScore = categoryMatched ? 1.0 : 0.0;
  factors.push({
    factor: "Category Match",
    weight: 10,
    score: categoryScore,
    earned: Math.round(categoryScore * 10 * 10) / 10,
    matched: categoryMatched,
    details: categoryMatched
      ? `Same category: ${lostReport.categoryName || "Matching Category"}`
      : "Different category categories",
  });

  // 2. Item Name Similarity (Weight: 15)
  const nameSim = Math.max(
    jaroWinkler(lostReport.itemName, foundReport.itemName),
    jaccardSimilarity(tokenize(lostReport.itemName), tokenize(foundReport.itemName))
  );
  factors.push({
    factor: "Item Name",
    weight: 15,
    score: nameSim,
    earned: Math.round(nameSim * 15 * 10) / 10,
    matched: nameSim >= 0.65,
    details: `"${lostReport.itemName}" vs "${foundReport.itemName}" (${Math.round(nameSim * 100)}% match)`,
  });

  // 3. Brand Match (Weight: 15)
  const brandComp = compareBrands(lostReport.brand, foundReport.brand);
  factors.push({
    factor: "Brand",
    weight: 15,
    score: brandComp.score,
    earned: Math.round(brandComp.score * 15 * 10) / 10,
    matched: brandComp.matched,
    details: brandComp.details,
  });

  // 4. Color Match (Weight: 10)
  const colorComp = compareColors(lostReport.color, foundReport.color);
  factors.push({
    factor: "Color",
    weight: 10,
    score: colorComp.score,
    earned: Math.round(colorComp.score * 10 * 10) / 10,
    matched: colorComp.matched,
    details: colorComp.details,
  });

  // 5. Location Similarity (Weight: 20)
  const locComp = compareLocations(lostReport.location, foundReport.location);
  factors.push({
    factor: "Location Proximity",
    weight: 20,
    score: locComp.score,
    earned: Math.round(locComp.score * 20 * 10) / 10,
    matched: locComp.matched,
    details: locComp.details,
  });

  // 6. Date Proximity (Weight: 10)
  const dateComp = compareDates(new Date(lostReport.date), new Date(foundReport.date));
  factors.push({
    factor: "Date Proximity",
    weight: 10,
    score: dateComp.score,
    earned: Math.round(dateComp.score * 10 * 10) / 10,
    matched: dateComp.matched,
    details: dateComp.details,
  });

  // 7. Description & Details Similarity (Weight: 10)
  const descComp = compareDescriptions(
    lostReport.description,
    foundReport.description,
    lostReport.identifyingFeatures,
    foundReport.identifyingFeatures
  );
  factors.push({
    factor: "Description & Features",
    weight: 10,
    score: descComp.score,
    earned: Math.round(descComp.score * 10 * 10) / 10,
    matched: descComp.matched,
    details: descComp.details,
  });

  // 8. Visual / Image Match (Weight: 10)
  const imgComp = compareImages(lostReport.imageUrl, foundReport.imageUrl);
  factors.push({
    factor: "Visual Media",
    weight: 10,
    score: imgComp.score,
    earned: Math.round(imgComp.score * 10 * 10) / 10,
    matched: imgComp.matched,
    details: imgComp.details,
  });

  // Total weighted score
  const totalEarned = factors.reduce((sum, f) => sum + f.earned, 0);
  const similarityScore = Math.min(100, Math.max(0, Math.round(totalEarned * 10) / 10));

  let tier: "VERY_STRONG" | "STRONG_POSSIBLE" | "POSSIBLE" | "LOW_MATCH";
  if (similarityScore >= 90) {
    tier = "VERY_STRONG";
  } else if (similarityScore >= 75) {
    tier = "STRONG_POSSIBLE";
  } else if (similarityScore >= 60) {
    tier = "POSSIBLE";
  } else {
    tier = "LOW_MATCH";
  }

  return {
    similarityScore,
    matchingFactors: factors,
    tier,
  };
}
