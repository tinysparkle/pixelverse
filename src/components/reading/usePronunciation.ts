"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function normalizeSpeechText(text: string) {
  return text
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[“”„‟"]/g, "")
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/[\(\)\[\]\{\}<>]/g, " ")
    .replace(/[.,!?;:/\\|*_+=~`%^&@#]+/g, " ")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "");
}

const PREFERRED_VOICE_NAME_PARTS = [
  "samantha",
  "google us english",
  "google uk english",
  "microsoft aria",
  "microsoft jenny",
  "microsoft guy",
  "microsoft ava",
  "microsoft andrew",
  "daniel",
  "alex",
  "serena",
  "allison",
];

const DEPRIORITIZED_VOICE_NAME_PARTS = [
  "espeak",
  "speech dispatcher",
  "festival",
  "compact",
  "sapi",
];

function scoreVoice(voice: SpeechSynthesisVoice, preferredLang: string) {
  const lang = voice.lang.toLowerCase();
  const name = voice.name.toLowerCase();
  let score = 0;

  if (lang === preferredLang.toLowerCase()) score += 60;
  else if (lang.startsWith("en-us")) score += 50;
  else if (lang.startsWith("en")) score += 35;
  else score -= 100;

  if (voice.localService) score += 12;
  if (voice.default) score += 6;

  const preferredNameIndex = PREFERRED_VOICE_NAME_PARTS.findIndex((part) => name.includes(part));
  if (preferredNameIndex >= 0) {
    score += 40 - preferredNameIndex;
  }

  const deprioritizedNameIndex = DEPRIORITIZED_VOICE_NAME_PARTS.findIndex((part) => name.includes(part));
  if (deprioritizedNameIndex >= 0) {
    score -= 30;
  }

  if (name.includes("natural")) score += 14;
  if (name.includes("neural")) score += 14;
  if (name.includes("enhanced")) score += 10;
  if (name.includes("premium")) score += 8;

  return score;
}

function pickEnglishVoice(voices: SpeechSynthesisVoice[], preferredLang: string) {
  if (!voices.length) return null;

  const englishVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith("en"));
  if (!englishVoices.length) return null;

  return [...englishVoices].sort((left, right) => scoreVoice(right, preferredLang) - scoreVoice(left, preferredLang))[0] ?? null;
}

export function usePronunciation(preferredLang = "en-US") {
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [supported, setSupported] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speakingText, setSpeakingText] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setSupported(false);
      return;
    }

    setSupported(true);

    function updateVoices() {
      setVoices(window.speechSynthesis.getVoices());
    }

    updateVoices();
    window.speechSynthesis.addEventListener("voiceschanged", updateVoices);

    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", updateVoices);
      window.speechSynthesis.cancel();
      utteranceRef.current = null;
      setSpeakingText(null);
    };
  }, []);

  const selectedVoice = useMemo(() => pickEnglishVoice(voices, preferredLang), [preferredLang, voices]);
  const canSpeakEnglish = supported && (voices.length === 0 || selectedVoice !== null);

  const stop = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setSpeakingText(null);
  }, []);

  const speak = useCallback((rawText: string) => {
    const text = normalizeSpeechText(rawText);
    if (!text) return false;
    if (typeof window === "undefined" || !("speechSynthesis" in window) || !canSpeakEnglish) return false;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = selectedVoice?.lang ?? preferredLang;
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }
    utterance.rate = 0.96;
    utterance.pitch = 1;
    utterance.volume = 1;
    utterance.onend = () => {
      utteranceRef.current = null;
      setSpeakingText((current) => (current === text ? null : current));
    };
    utterance.onerror = () => {
      utteranceRef.current = null;
      setSpeakingText((current) => (current === text ? null : current));
    };

    utteranceRef.current = utterance;
    setSpeakingText(text);
    window.speechSynthesis.speak(utterance);
    return true;
  }, [preferredLang, selectedVoice]);

  return {
    speak,
    stop,
    supported: canSpeakEnglish,
    speakingText,
  };
}
