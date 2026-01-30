// Tiny variability helpers: openers + a single rotating blurt per issue.

function pick(arr, indexSeed = 0) {
  if (!arr?.length) return '';
  const i = Math.abs(indexSeed) % arr.length;
  return arr[i];
}

export function openerFor(section, bot, profile, seed = 0) {
  const excited = profile.excitability >= 8;
  const snarky  = profile.snark >= 7 || profile.sarcasm >= 7;

  const openers = {
    Intro: {
      entertainer: excited
        ? ["Okay, breathe.", "Sound the alarms.", "Oh we cooking."]
        : ["Let’s talk.", "Real quick:", "Here’s the vibe."],
      analyst: profile.depth >= 8
        ? ["Context first:", "Signal check:", "Quick calibration:"]
        : ["Big picture:", "The read:", "Net-net:"]
    },
    FinalWord: {
      entertainer: snarky
        ? ["I said what I said.", "Clip this.", "Book it."]
        : ["That’s the note.", "We’ll see.", "Keep receipts."],
      analyst: profile.depth >= 8
        ? ["Actionables:", "Final note:", "One last thing:"]
        : ["Bottom line:", "That’s it.", "Wrap:"]
    }
  };

  const pool = (openers[section]?.[bot]) || null;
  return pick(pool, seed);
}

// One 1–2 sentence “blurt” driven by mood.
// We keep it simple and deterministic (no randomness).
export function makeBlurt(bot, summaryMood) {
  if (bot === 'entertainer') {
    if (summaryMood === 'Fired Up')  return "This league finally has a pulse. Keep the chaos coming.";
    if (summaryMood === 'Deflated')  return "I need a palate cleanser. Somebody trade something spicy.";
    return null; // Focused → no blurt
  }
  // analyst
  if (summaryMood === 'Fired Up')    return "Trends are stabilizing; small edges matter more this week.";
  if (summaryMood === 'Deflated')    return "Variance spiked. Tighten risk and play the floor where it counts.";
  return null;
}
