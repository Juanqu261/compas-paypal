import type { ClassificationResult, PurposeClassifier } from "../../compas/ports/purpose-classifier";
import { notImplemented } from "../../lib/not-implemented";

/**
 * Placeholder. No model is selected and no classification is returned.
 * A future adapter must return a structured category, confidence, and evidence.
 * It must not return ALLOW, DENY, or REVIEW.
 */
export class UnimplementedPurposeClassifier implements PurposeClassifier {
  classify(): Promise<ClassificationResult> {
    return notImplemented("PurposeClassifier.classify");
  }
}
