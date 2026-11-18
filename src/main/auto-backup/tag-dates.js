const SNAPSHOT_TAG = /^mfe-[a-f0-9]{32}-[a-f0-9]{32}$/;
const REPOSITORY = /^([a-z0-9][a-z0-9_-]{1,38})\/([a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*)$/;

/**
 * Push times of a repository's drive snapshot tags, read from the Docker Hub API. Snapshots published before the
 * created annotation existed are dated this way so the daily and weekly rules can still place them.
 * hubGet is the transport's fixed read-only Docker Hub call. At most 10 pages of 100 tags are read, which covers
 * the client's 1,000 tag limit.
 */
export function createTagDates(hubGet) {
  return async function tagDates(repository, signal) {
    const match = REPOSITORY.exec(String(repository));
    if (!match) throw Error('Invalid repository.');
    const dates = new Map();
    for (let page = 1; page <= 10; page++) {
      const body = await hubGet(`/v2/namespaces/${match[1]}/repositories/${match[2]}/tags?page_size=100&page=${page}`, signal);
      for (const item of Array.isArray(body?.results) ? body.results : []) {
        if (typeof item?.name !== 'string' || !SNAPSHOT_TAG.test(item.name)) continue;
        const time = Date.parse(item.tag_last_pushed ?? item.last_updated ?? '');
        if (Number.isFinite(time)) dates.set(item.name, time);
      }
      if (!body?.next) break;
    }
    return dates;
  };
}
