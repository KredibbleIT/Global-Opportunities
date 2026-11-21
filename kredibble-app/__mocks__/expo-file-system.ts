// Jest stand-in for expo-file-system: only the File class the upload helper uses.
export class File {
  uri: string;
  name: string;
  type = 'application/octet-stream';

  constructor(uri: string) {
    this.uri = uri;
    this.name = uri.split('/').pop() || 'file';
  }

  async bytes(): Promise<Uint8Array> {
    return new Uint8Array();
  }
}
