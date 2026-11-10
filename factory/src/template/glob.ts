/** Small glob matcher for forward-slash relative paths: `**`, `*`, `?` and `{a,b}`. No dependency. */

const escape = (s: string) => s.replace(/[.+^$()|[\]\\]/g, '\\$&');

export function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') {
          i++;
          re += '(?:.*/)?';
        } else {
          re += '.*';
        }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else if (c === '{') {
      const end = glob.indexOf('}', i);
      if (end < 0) {
        re += '\\{';
      } else {
        re += `(?:${glob.slice(i + 1, end).split(',').map(escape).join('|')})`;
        i = end;
      }
    } else if (c === '}') {
      re += '\\}';
    } else {
      re += escape(c);
    }
  }
  return new RegExp(`^${re}$`);
}

export function matchesAny(path: string, globs: readonly string[]): boolean {
  return globs.some((g) => globToRegExp(g).test(path));
}

/** A path as globs see it: relative, forward slashes, no leading `./`. */
export const toPosix = (p: string): string => p.split('\\').join('/').replace(/^\.\//, '');
