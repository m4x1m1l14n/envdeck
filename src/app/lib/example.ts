import schemaText from '../../../examples/.env.example?raw'
import productionText from '../../../examples/.env.production?raw'
import stagingText from '../../../examples/.env.staging?raw'
import { envToMap, parseEnv, parseSchema } from '../../core'

export const exampleSchemaText = schemaText

const values = (text: string) => Object.fromEntries(envToMap(parseEnv(text)))

/** A demo project with a schema and three environments, one of them drifted. */
export function exampleProject() {
  return {
    name: 'Acme API (example)',
    schema: parseSchema(schemaText).schema,
    environments: [
      { name: 'development', fileName: '.env', values: {} },
      { name: 'staging', fileName: '.env.staging', values: values(stagingText) },
      { name: 'production', fileName: '.env.production', values: values(productionText) },
    ],
  }
}
