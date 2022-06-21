export type PersistedObject = PersistedObjectRequiredProperties &
  PersistedObjectOptionalProperties;

interface PersistedObjectRequiredProperties {
  _key: string;
  _type: string;
}

export interface PersistedObjectOptionalProperties {
  /**
   * The name that will be displayed for the persisted object
   *
   * The value of this field will be used to label vertices/edges
   * in the UI.
   */
  displayName?: string;

  /**
   * The hyperlink URL to the entity source
   *
   * The value of this field will be used by the UI to link to the source entity
   * in a new browser tab.
   */
  webLink?: string;
}
