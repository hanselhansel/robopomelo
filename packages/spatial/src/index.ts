export { resolveBinding, invalidateBindings, affectedScenarios, overrideBinding, explainBindings, type ResolvedBinding, type BindingExplanation } from './bindings.js';
export {
  UnitError, convertLength, convertAngle, convertSpeed, convertAcceleration, convertAngularSpeed,
  type LengthUnit, type AngleUnit, type SpeedUnit, type AccelerationUnit, type AngularSpeedUnit,
} from './units.js';
export { SpatialError, sha256Hex, canonicalJson, hashJson } from './hash.js';
export {
  validateCatalog, validateEntry, catalogEntry, assetRefFor, bundledCatalog, entryHash, assertSafeData,
  type Catalog, type CatalogEntry, type Collision, type Display, type NumberParameter, type ParameterSchema, type RobotSpec,
} from './catalog.js';
export {
  isConvex, isSimple, isPolygon, isPoint, isPose, area, signedArea, bounds, containsPolygon, rectangle, transformPoint, transformPolygon,
  resolveParameters, footprintFor, extentsFor, heightIntervalFor, type Point, type Polygon, type Bounds,
} from './geometry.js';
export { compileScene, INSTANCE_LIMIT, type CompiledScene, type CompiledObject, type CollisionVolume, type CompileOptions, type DimensionState } from './compile.js';
export { validateRecipe, compileRecipe, RACK_ROW_RECIPE, RECIPE_LIMITS, EXTRUSION_VERTEX_LIMIT, type AssemblyRecipe, type RecipeNode, type CompiledRecipe, type RecipePrimitive } from './assembly.js';
export { validateBehavior, compatibleWith, behaviorFor, STATION_QUEUE_BEHAVIOR, BEHAVIOR_BOUNDS, type BehaviorProfile } from './behavior.js';
export {
  validateTemplate, instantiateTemplate, RECEIVING_TO_STAGING_TEMPLATE, TEMPLATE_PARAMETERS,
  type ScenarioTemplate, type TemplateContext, type TemplatePlacement, type TemplateStation, type TemplateParameterName,
} from './template.js';
export {
  newDraft, validateDraft, validateContent, promote, assertLibraryRecord, libraryHash, SEMVER,
  type AssetDraft, type DraftKind, type DraftStatus, type Finding, type LibraryRecord, type PromoteOptions, type ValidationContext,
} from './draft.js';
