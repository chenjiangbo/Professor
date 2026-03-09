import { getActiveSubscriptionTierByUserId } from '~/lib/billing/repo'
import { getNotebook, updateNotebookCoverForUser } from '~/lib/repo'
import { isAdminUserId } from '~/lib/requestAuth'
import { generateNotebookCoverImage } from './generate'

export async function generateNotebookCoverForNotebook(userId: string, notebookId: string) {
  const notebook = await getNotebook(userId, notebookId)
  if (!notebook) {
    throw new Error('Notebook not found')
  }

  const { tier } = await getActiveSubscriptionTierByUserId(userId)
  const effectiveTier = isAdminUserId(userId) ? 'premium' : tier
  if (effectiveTier !== 'premium') {
    throw new Error('Notebook cover generation is available for premium tier only')
  }

  await updateNotebookCoverForUser(userId, notebookId, {
    coverStatus: 'generating',
  })

  const generated = await generateNotebookCoverImage({
    notebookId,
    title: String(notebook.title || ''),
    description: String(notebook.description || ''),
  })

  const updated = await updateNotebookCoverForUser(userId, notebookId, {
    coverUrl: generated.storedPath,
    coverStatus: 'ready',
    touchCoverUpdatedAt: true,
  })

  if (!updated) {
    throw new Error('Notebook disappeared while saving cover')
  }

  return updated
}
