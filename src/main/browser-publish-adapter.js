import {validateRequest} from '../shared/publication-request.js';

// Routes an approved browser publication request into the desktop forge workflow. The mediator has already validated and
// confirmed the request; this adapter only chooses a fixed GraphQL document for the destination, and sends it through the
// forge workflow's `postNote`, which uses the active protected account. It returns exactly `true` when the forge accepted
// the note and `false` for every other outcome, so the browser only ever sees a fixed state word. It never logs the note
// and never returns a link, account name or credential.
export const DEFAULT_PUBLICATION_TARGETS = Object.freeze({
  repository: Object.freeze({owner: 'Ding-Ding-Projects', name: 'material-file-encryptor'}),
  discussionTitle: 'Browser extension progress',
  // Project updates and drafts need a configured project (node id, status field and options). None is shipped, and the
  // account scope may also lack project access, so both destinations answer unavailable until one is configured.
  project: null,
});

const DISCUSSION_LOOKUP = 'query($owner:String!,$name:String!){repository(owner:$owner,name:$name){discussions(first:50,orderBy:{field:UPDATED_AT,direction:DESC}){nodes{id title}}}}';
const DISCUSSION_COMMENT = 'mutation($discussionId:ID!,$body:String!){addDiscussionComment(input:{discussionId:$discussionId,body:$body}){comment{id}}}';
const DRAFT_ITEM = 'mutation($projectId:ID!,$title:String!,$body:String!){addProjectV2DraftIssue(input:{projectId:$projectId,title:$title,body:$body}){projectItem{id}}}';
const ITEM_STATUS = 'mutation($projectId:ID!,$itemId:ID!,$fieldId:ID!,$optionId:String!){updateProjectV2ItemFieldValue(input:{projectId:$projectId,itemId:$itemId,fieldId:$fieldId,value:{singleSelectOptionId:$optionId}}){projectV2Item{id}}}';
const ID = /^[A-Za-z0-9_=-]{4,128}$/;
const NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;

const bodyOf = request => request.links.length ? request.note + '\n\n' + request.links.map(link => '- ' + link).join('\n') : request.note;
const titleOf = note => (note.split('\n', 1)[0] || 'Progress note').slice(0, 80);

export function createPublishProgressAdapter({forge, targets = DEFAULT_PUBLICATION_TARGETS} = {}) {
  const post = async (operation, variables) => {
    if (!forge || typeof forge.postNote !== 'function') return null;
    const result = await forge.postNote({operation: {query: operation}, variables});
    return result?.posted === true ? result.data ?? {} : null;
  };
  return async function publishProgress(request, {signal} = {}) {
    try {
      if (signal?.aborted || !validateRequest(request).ok) return false;
      const body = bodyOf(request);
      if (request.destination === 'discussion-comment') {
        const repository = targets?.repository;
        if (!repository || !NAME.test(repository.owner ?? '') || !NAME.test(repository.name ?? '') || typeof targets.discussionTitle !== 'string') return false;
        // The lookup is a read through the same active account; with no account it makes no call and the note is not posted.
        const found = await post(DISCUSSION_LOOKUP, {owner: repository.owner, name: repository.name});
        const nodes = found?.repository?.discussions?.nodes;
        const discussion = Array.isArray(nodes) ? nodes.find(item => item?.title === targets.discussionTitle && ID.test(item.id ?? '')) : null;
        if (!discussion || signal?.aborted) return false;
        const posted = await post(DISCUSSION_COMMENT, {discussionId: discussion.id, body});
        return posted?.addDiscussionComment?.comment?.id !== undefined;
      }
      const project = targets?.project;
      if (!project || !ID.test(project.projectId ?? '')) return false;
      if (request.destination === 'publication-draft') {
        const posted = await post(DRAFT_ITEM, {projectId: project.projectId, title: titleOf(request.note), body});
        return posted?.addProjectV2DraftIssue?.projectItem?.id !== undefined;
      }
      const optionId = project.statusOptions?.[request.projectStatus];
      if (!ID.test(project.itemId ?? '') || !ID.test(project.statusFieldId ?? '') || typeof optionId !== 'string' || !ID.test(optionId)) return false;
      const posted = await post(ITEM_STATUS, {projectId: project.projectId, itemId: project.itemId, fieldId: project.statusFieldId, optionId});
      return posted?.updateProjectV2ItemFieldValue?.projectV2Item?.id !== undefined;
    } catch {
      return false;
    }
  };
}
