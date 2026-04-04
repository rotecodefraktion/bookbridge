import { describe, it, expect } from 'vitest';
import { rewriteAssetUrls } from './assets';

describe('rewriteAssetUrls', () => {
  const baseUrl = 'http://bookstack.local:6875';

  describe('image rewriting', () => {
    it('rewrites absolute image URL to local path', () => {
      const md = '![alt](http://bookstack.local:6875/uploads/images/gallery/image.png)';
      const imageMap = new Map([
        ['http://bookstack.local:6875/uploads/images/gallery/image.png', 'BookStack/Attachments/gallery/image.png'],
      ]);
      const result = rewriteAssetUrls(md, imageMap, new Map(), baseUrl);
      expect(result).toBe('![alt](BookStack/Attachments/gallery/image.png)');
    });

    it('rewrites relative image URL to local path', () => {
      const md = '![alt](/uploads/images/gallery/image.png)';
      const imageMap = new Map([
        ['http://bookstack.local:6875/uploads/images/gallery/image.png', 'BookStack/Attachments/gallery/image.png'],
      ]);
      const result = rewriteAssetUrls(md, imageMap, new Map(), baseUrl);
      expect(result).toBe('![alt](BookStack/Attachments/gallery/image.png)');
    });

    it('strips link wrapper from linked images', () => {
      const md = '[![alt](http://bookstack.local:6875/uploads/images/gallery/image.png)](http://bookstack.local:6875/uploads/images/gallery/image.png)';
      const imageMap = new Map([
        ['http://bookstack.local:6875/uploads/images/gallery/image.png', 'BookStack/Attachments/gallery/image.png'],
      ]);
      const result = rewriteAssetUrls(md, imageMap, new Map(), baseUrl);
      expect(result).toBe('![alt](BookStack/Attachments/gallery/image.png)');
    });

    it('strips link wrapper from linked images with relative inner URL', () => {
      const md = '[![alt](/uploads/images/gallery/image.png)](http://bookstack.local:6875/uploads/images/gallery/image.png)';
      const imageMap = new Map([
        ['http://bookstack.local:6875/uploads/images/gallery/image.png', 'BookStack/Attachments/gallery/image.png'],
      ]);
      const result = rewriteAssetUrls(md, imageMap, new Map(), baseUrl);
      expect(result).toBe('![alt](BookStack/Attachments/gallery/image.png)');
    });

    it('leaves non-BookStack images unchanged', () => {
      const md = '![tux](https://www.markdownguide.org/assets/images/tux.png)';
      const result = rewriteAssetUrls(md, new Map(), new Map(), baseUrl);
      expect(result).toBe(md);
    });
  });

  describe('attachment rewriting', () => {
    it('rewrites absolute attachment URL', () => {
      const md = '[file.xlsx](http://bookstack.local:6876/attachments/2)';
      const attachmentMap = new Map([
        [2, 'BookStack/Attachments/attachments/file.xlsx'],
      ]);
      const result = rewriteAssetUrls(md, new Map(), attachmentMap, baseUrl);
      expect(result).toBe('[file.xlsx](BookStack/Attachments/attachments/file.xlsx)');
    });

    it('rewrites relative attachment URL', () => {
      const md = '[file.xlsx](/attachments/2)';
      const attachmentMap = new Map([
        [2, 'BookStack/Attachments/attachments/file.xlsx'],
      ]);
      const result = rewriteAssetUrls(md, new Map(), attachmentMap, baseUrl);
      expect(result).toBe('[file.xlsx](BookStack/Attachments/attachments/file.xlsx)');
    });

    it('leaves attachment link unchanged when ID not in map', () => {
      const md = '[file.xlsx](http://bookstack.local:6876/attachments/99)';
      const result = rewriteAssetUrls(md, new Map(), new Map(), baseUrl);
      expect(result).toBe(md);
    });
  });
});
