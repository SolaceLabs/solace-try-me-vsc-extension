import { useEffect, useState } from "react";

import ConnectionManager from "../Shared/components/ConnectionManager";
import SolaceManager from "../Shared/SolaceManager";

const PublishView = () => {
  const [solaceConnection, setSolaceConnection] = useState<SolaceManager|null>(null);

  useEffect(() => {
    console.log("Current broker:", solaceConnection);
  }, [solaceConnection]);

  return (
    <div>
      <ConnectionManager onSetConnection={setSolaceConnection} />
    </div>
  );
};

export default PublishView;
