import { experimental_generateImage as generateImage } from 'ai'
import { createVertexProvider } from '~/lib/ai/vertex'
import { buildNotebookCoverPrompt } from './prompt'
import { resolveNotebookCoverModel } from './env'
import { saveNotebookCoverImage } from './storage'

export async function generateNotebookCoverImage(input: {
  notebookId: string
  title: string
  description?: string | null
}) {
  const vertex = createVertexProvider()
  const modelId = resolveNotebookCoverModel()
  const prompt = buildNotebookCoverPrompt(input.title, input.description)

  const result = await generateImage({
    model: vertex.image(modelId),
    prompt,
    aspectRatio: '16:9',
    providerOptions: {
      vertex: {
        addWatermark: false,
        personGeneration: 'dont_allow',
        safetySetting: 'block_low_and_above',
        sampleImageSize: '1K',
      },
    },
  })

  const image = result.image
  const saved = await saveNotebookCoverImage(input.notebookId, image.uint8Array, image.mediaType)

  return {
    storedPath: saved.storedPath,
    mediaType: saved.mediaType,
  }
}
