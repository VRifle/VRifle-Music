export const getDirectImageUrl = (url: string) => {
  if (!url) return '';
  
  // Handle Dropbox links
  if (url.includes('dropbox.com')) {
    return url.replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace('?dl=0', '');
  }
  
  // Handle Google Drive links
  if (url.includes('drive.google.com')) {
    const match = url.match(/[-\w]{25,}/);
    if (match) {
      return `https://docs.google.com/uc?export=view&id=${match[0]}`;
    }
  }
  
  return url;
};
