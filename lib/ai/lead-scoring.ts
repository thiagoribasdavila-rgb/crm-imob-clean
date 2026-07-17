import { predictConversionDetailed, type ConversionSignals } from "@/lib/ai/conversion-predictor";

export function scoreLead(lead: ConversionSignals) {
  return predictConversionDetailed(lead).probability;
}
