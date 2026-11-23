export const REVIEW_LIMITS = {
  bodyBytes: 16 * 1024,
  ratingMin: 1,
  scaleMin: 2,
  scaleMax: 10,
  scaleDefault: 5,
  nameLength: 160,
  titleLength: 200,
  bodyLength: 6000,
  fieldCount: 12,
  fieldKeyLength: 48,
  fieldLabelLength: 100,
  fieldValueLength: 250,
  verificationLength: 1000,
  publicPage: 50,
} as const;
export const REVIEW_SUBMIT_SCOPE = 'reviews:submit';
export const REVIEW_SUBMISSION_EVENT = 'reviews.submission_created';
export const REVIEW_SUBMISSIONS_METRIC = 'reviews.submissions';
